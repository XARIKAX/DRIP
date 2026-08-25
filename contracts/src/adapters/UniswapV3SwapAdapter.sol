// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @notice The two functions of the Uniswap v3 router this adapter needs.
/// @dev Declared locally so the repo carries no Uniswap dependency. A v4 router
///      swap is the same shape: replace this interface and the one call in _swap.
interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title UniswapV3SwapAdapter
/// @notice PRODUCTION adapter. Points the reinvest module at the chain's real Uniswap.
/// @dev NOT DEPLOYED ON TESTNET. Testnet runs MockSwapAdapter. This file exists so the
///      Solidity developer has the production seam already written, reviewed against
///      the same ISwapAdapter the frontend and Reinvestor already use.
///
///      Read this before deploying it:
///
///      1. quote() reads IPriceOracle, not the pool. That is the point. Reinvestor
///         derives minAmountOut from quote(), so if quote() read the pool, a sandwich
///         could move the pool, get quoted the moved price, and pass its own guard.
///      2. The pool fee tier per pair is admin configured. Wrong tier means a pool that
///         does not exist and a reverting swap, not a bad fill.
///      3. deadline is block.timestamp because this is only ever called inside the same
///         transaction as the claim that funds it. There is no mempool exposure window
///         to protect against with a longer deadline, and a longer one only helps a
///         reorg. If that stops being true, thread a real deadline through.
///      4. Nothing is held here between transactions. Any residual balance is a bug.
contract UniswapV3SwapAdapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    /// @notice The Uniswap v3 router on this chain.
    IUniswapV3Router public immutable router;

    /// @notice USDG.
    address public immutable usdg;

    /// @notice Reference price source. Must not be the pool.
    IPriceOracle public priceOracle;

    /// @notice Pool fee tier per stock token, in hundredths of a bip. 3000 = 0.30 percent.
    mapping(address => uint24) public feeTier;

    /// @notice Fee tier used when a token has none configured.
    uint24 public defaultFeeTier = 3000;

    event PriceOracleSet(address indexed oracle);
    event FeeTierSet(address indexed stockToken, uint24 fee);
    event DefaultFeeTierSet(uint24 fee);

    error ZeroAddress();
    error UnknownPair(address tokenIn, address tokenOut);

    constructor(IUniswapV3Router router_, address usdg_, IPriceOracle oracle_, address owner_) Ownable(owner_) {
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
    ///      change when the venue does.
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
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(tokenIn).forceApprove(address(router), 0);
    }
}
