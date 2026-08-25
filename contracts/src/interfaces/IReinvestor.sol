// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReinvestor
/// @notice The DRIP module. Claimed USDG becomes more of the same stock token, immediately.
/// @dev Robinhood reinvests the trading day after the pay date, during market hours, and
///      locks the fractional share inside its app. This does it in the same transaction the
///      dividend lands, at any hour, into a token the holder can move.
interface IReinvestor {
    /// @notice A claim was swapped back into stock.
    event Reinvested(address indexed user, address indexed stockToken, uint256 usdgIn, uint256 tokensOut);

    /// @notice A holder changed their slippage tolerance.
    event SlippageSet(address indexed user, uint256 maxSlippageBps);

    /// @notice The swap venue was repointed.
    event SwapAdapterSet(address indexed adapter);

    /// @notice Swap USDG into stockToken and credit it to the holder's DripCore position.
    /// @dev Callable by CORE_ROLE (StreamEngine and DripCore). The USDG must already
    ///      have been transferred to this contract by the caller.
    function reinvest(address user, address stockToken, uint256 usdgAmount) external returns (uint256 tokensOut);

    /// @notice Set the caller's maximum acceptable slippage in basis points.
    function setMaxSlippage(uint256 maxSlippageBps) external;

    /// @notice Effective slippage tolerance for a holder, defaulted if never set.
    function maxSlippageBps(address user) external view returns (uint256);
}
