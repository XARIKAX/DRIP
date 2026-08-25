// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISwapAdapter
/// @notice The seam between the reinvest module and whatever DEX is on the chain.
/// @dev Testnet plugs in MockSwapAdapter with an admin set price. Production plugs
///      in UniswapV3SwapAdapter pointed at the chain's real router. Reinvestor never
///      changes.
interface ISwapAdapter {
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
