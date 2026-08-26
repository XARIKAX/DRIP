// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @notice The one function of SwapRouter02 this adapter calls.
/// @dev Declared locally so the repo carries no Uniswap dependency. This is the
///      SwapRouter02 shape: there is NO deadline field in the params struct. The
///      original SwapRouter's ExactInputSingleParams has one; encoding against the
///      wrong struct produces calldata the router cannot decode. Robinhood Chain
///      runs SwapRouter02 at 0xcaf681a66d020601342297493863e78c959e5cb2.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title UniswapV3SwapAdapter
/// @notice PRODUCTION adapter. Points the reinvest module at the chain's Uniswap
///         deployment through SwapRouter02.
/// @dev NOT DEPLOYED ON TESTNET. Testnet runs MockSwapAdapter. Read this before
///      deploying it; every point below is a listing rule that kept real money safe.
///
///      1. quote() reads the Chainlink oracle, never the pool. Reinvestor derives
///         minAmountOut from quote(), so if quote() read the pool a sandwich could
///         move the pool, get quoted the moved price, and pass its own guard. The
///         minOut always bounds the FINAL token against the Chainlink price.
///      2. This adapter swaps USDG to the stock token: one hop, fee tier 3000 unless
///         configured otherwise per token. The chain has no direct ETH/stock pools;
///         full entry routes are WETH -3000-> USDG -3000-> token, and this protocol
///         already holds the USDG mid-hop asset, so exactInputSingle on the final
///         leg is the whole job. Anything longer belongs in a path-encoded
///         exactInput, bounded the same way.
///      3. Verify every route through QuoterV2
///         (0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7) before wiring a token, and
///         re-check the fee tier per pool. See script/VerifyUniverse.s.sol.
///      4. Nothing is held here between transactions. Any residual balance is a bug.
contract UniswapV3SwapAdapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The SwapRouter02 on this chain.
    ISwapRouter02 public immutable router;

    /// @notice USDG.
    address public immutable usdg;

    /// @notice Reference price source. Chainlink, never the pool.
    IPriceOracle public priceOracle;

    /// @notice Pool fee tier per stock token, in hundredths of a bip. 3000 = 0.30 percent.
    mapping(address => uint24) public feeTier;

    /// @notice Fee tier used when a token has none configured. Every listed pool is 3000.
    uint24 public defaultFeeTier = 3000;

    event PriceOracleSet(address indexed oracle);
    event FeeTierSet(address indexed stockToken, uint24 fee);
    event DefaultFeeTierSet(uint24 fee);

    error ZeroAddress();
    error UnknownPair(address tokenIn, address tokenOut);

    constructor(ISwapRouter02 router_, address usdg_, IPriceOracle oracle_, address owner_) Ownable(owner_) {
        if (address(router_) == address(0) || usdg_ == address(0) || address(oracle_) == address(0)) {
            revert ZeroAddress();
        }
        router = router_;
        usdg = usdg_;
        priceOracle = oracle_;
        emit PriceOracleSet(address(oracle_));
    }

    /// @notice Repoint the reference price source.
    function setPriceOracle(IPriceOracle oracle_) external onlyOwner {
        if (address(oracle_) == address(0)) revert ZeroAddress();
        priceOracle = oracle_;
        emit PriceOracleSet(address(oracle_));
    }

    /// @notice Set the pool fee tier for a stock token.
    function setFeeTier(address stockToken, uint24 fee) external onlyOwner {
        feeTier[stockToken] = fee;
        emit FeeTierSet(stockToken, fee);
    }

    /// @notice Set the fallback fee tier.
    function setDefaultFeeTier(uint24 fee) external onlyOwner {
        defaultFeeTier = fee;
        emit DefaultFeeTierSet(fee);
    }

    /// @inheritdoc ISwapAdapter
    /// @dev Oracle math, identical in shape to MockSwapAdapter so behaviour does not
    ///      change when the venue does. The oracle itself enforces feed liveness and
    ///      fails closed on a stale read.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        if (tokenIn == usdg) {
            return (amountIn * 1e18) / priceOracle.priceUsdg(tokenOut);
        }
        if (tokenOut == usdg) {
            return (amountIn * priceOracle.priceUsdg(tokenIn)) / 1e18;
        }
        revert UnknownPair(tokenIn, tokenOut);
    }

    /// @inheritdoc ISwapAdapter
    /// @dev minAmountOut arrives from Reinvestor, already derived from the Chainlink
    ///      quote above and the holder's slippage tolerance. SwapRouter02 enforces it
    ///      onchain; a fill worse than the oracle allows reverts instead of landing.
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(router), amountIn);

        address stock = tokenIn == usdg ? tokenOut : tokenIn;
        uint24 fee = feeTier[stock];
        if (fee == 0) fee = defaultFeeTier;

        amountOut = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(tokenIn).forceApprove(address(router), 0);
    }
}
