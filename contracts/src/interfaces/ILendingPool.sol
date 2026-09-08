// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILendingPool
/// @notice The credit side of the protocol, as DripCore sees it.
/// @dev DripCore holds the collateral and realises the dividend income, so it is the
///      one contract that has to ask the market two questions: may this withdrawal
///      happen, and does this holder owe anything the dividend should pay first.
///      Kept to those two so a change to the market's economics never reaches into
///      the custody contract.
interface ILendingPool {
    /// @notice Revert if withdrawing `amount` of `stockToken` would leave `user` unhealthy.
    /// @dev Called on every DripCore withdrawal. A user with no debt always passes.
    function requireWithdrawAllowed(address user, address stockToken, uint256 amount) external view;

    /// @notice How much of `available` USDG this holder's debt should absorb.
    /// @dev A view so DripCore can size the transfer before making it. Returns zero for
    ///      a holder with no debt, which is the overwhelmingly common case.
    function debtServiceDue(address user, uint256 available) external view returns (uint256);

    /// @notice Apply `amount` of USDG to `user`'s debt, interest first.
    /// @dev The caller must have approved `amount` to this pool. Reverts if `amount`
    ///      exceeds what `debtServiceDue` quoted for the same state.
    function serviceDebt(address user, uint256 amount) external;
}
