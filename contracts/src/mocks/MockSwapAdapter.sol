// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";

/// @title MockSwapAdapter
/// @notice TESTNET ONLY. A fixed price venue so the reinvest loop can be demonstrated
///         end to end without a live pool.
/// @dev Holds an inventory of stock tokens and prices them in USDG at an admin set
///      rate. It also simulates a configurable price impact so the slippage guard in
///      Reinvestor is exercised by tests rather than assumed. Production deletes this
///      and deploys UniswapV3SwapAdapter against the chain's real router. Reinvestor
///      only knows ISwapAdapter, so nothing downstream changes.
///
///      This contract is not a pool. It does not hold USDG reserves for the reverse
///      direction beyond what it is seeded with, and it has no invariant. Do not read
///      anything into its pricing.
contract MockSwapAdapter is ISwapAdapter, Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    /// @notice USDG (6 decimals) per one whole stock token (1e18).
    mapping(address => uint256) public priceUsdg;

    /// @notice Simulated price impact in basis points, applied to the fill but NOT to the quote.
    /// @dev That asymmetry is the point. A mock whose quote already contains its own
    ///      slippage can never make a slippage guard fire, because the guard is derived
    ///      from the quote. Here quote() is the honest reference price and swap() fills
    ///      worse than it, exactly like a real pool moving under a trade.
    uint256 public simulatedSlippageBps;

    event PriceSet(address indexed stockToken, uint256 priceUsdg);
    event SimulatedSlippageSet(uint256 bps);
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    error UnknownPair(address tokenIn, address tokenOut);
    error NoPrice(address stockToken);
    error InsufficientOutput(uint256 amountOut, uint256 minAmountOut);
    error InsufficientInventory(uint256 have, uint256 need);

    constructor(address usdg_, address owner_) Ownable(owner_) {
        usdg = usdg_;
    }

    /// @notice The USDG token this venue prices against.
    address public immutable usdg;

    /// @notice Set the price of a stock token in USDG.
    function setPrice(address stockToken, uint256 priceUsdg_) external onlyOwner {
        priceUsdg[stockToken] = priceUsdg_;
        emit PriceSet(stockToken, priceUsdg_);
    }

    /// @notice Dial in an artificial price impact so slippage guards can be tested.
    function setSimulatedSlippageBps(uint256 bps) external onlyOwner {
        require(bps < BPS, "slippage too high");
        simulatedSlippageBps = bps;
        emit SimulatedSlippageSet(bps);
    }

    /// @inheritdoc ISwapAdapter
    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256 amountOut) {
        amountOut = _idealOut(tokenIn, tokenOut, amountIn);
    }

    /// @notice What the venue would actually fill, simulated impact included.
    function fillPreview(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        return (_idealOut(tokenIn, tokenOut, amountIn) * (BPS - simulatedSlippageBps)) / BPS;
    }

    /// @inheritdoc ISwapAdapter
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut)
    {
        amountOut = fillPreview(tokenIn, tokenOut, amountIn);
        if (amountOut < minAmountOut) revert InsufficientOutput(amountOut, minAmountOut);

        uint256 inventory = IERC20(tokenOut).balanceOf(address(this));
        if (inventory < amountOut) revert InsufficientInventory(inventory, amountOut);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);
        emit Swapped(tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @notice Seed the venue with inventory. Anyone may donate on testnet.
    function seed(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @dev USDG in, stock out: amountIn (6dp) * 1e18 / price (6dp).
    ///      Stock in, USDG out: amountIn (18dp) * price (6dp) / 1e18.
    function _idealOut(address tokenIn, address tokenOut, uint256 amountIn) private view returns (uint256) {
        if (tokenIn == usdg) {
            uint256 p = priceUsdg[tokenOut];
            if (p == 0) revert NoPrice(tokenOut);
            return (amountIn * 1e18) / p;
        }
        if (tokenOut == usdg) {
            uint256 p = priceUsdg[tokenIn];
            if (p == 0) revert NoPrice(tokenIn);
            return (amountIn * p) / 1e18;
        }
        revert UnknownPair(tokenIn, tokenOut);
    }
}
