// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISwapAdapter
/// @notice The seam between the reinvest module and whatever DEX is on the chain.
/// @dev Testnet plugs in MockSwapAdapter with an admin set price. Production plugs
///      in UniswapV3SwapAdapter pointed at the chain's real router. Reinvestor never
///      changes.
interface ISwapAdapter {
    /// @notice USDG (6 decimals) per one whole stock token (1e18).
    /// @dev The reference price for a single token, which `quote` needs an amount and a
    ///      pair to express. Every consumer wants this shape: the app prices positions
    ///      with it, and it is the number a holder sees. MockSwapAdapter satisfies it
    ///      with its admin set price mapping; UniswapV3SwapAdapter reads Chainlink.
    ///      Never the pool — see the note on `quote` in the production adapter.
    function priceUsdg(address stockToken) external view returns (uint256);

    /// @notice Expected output for an exact input swap, ignoring fees taken outside the pool.
    /// @dev Views only. Never trust this as a price oracle for anything but UI hints and
    ///      slippage floors that the caller also bounds.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);

    /// @notice Swap an exact input amount. Caller must have approved amountIn to this adapter.
    /// @param tokenIn      Token sold.
    /// @param tokenOut     Token bought.
    /// @param amountIn     Exact input amount.
    /// @param minAmountOut Revert if output is below this.
    /// @param recipient    Who receives tokenOut.
    /// @return amountOut   Tokens actually received by recipient.
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut);
}
