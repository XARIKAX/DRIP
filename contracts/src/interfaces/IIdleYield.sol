// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IIdleYield
/// @notice Somewhere for the pool's resting USDG to earn while it waits.
/// @dev Deliberately four functions. The venue this was built for is Twofold's
///      DualPool on Robinhood Chain, where the USDG side earns vault yield between
///      trades and swap fees when a trade needs it — but the vault must not know that,
///      because the next venue will be shaped differently and the vault is the thing
///      holding other people's money. Anything that can take USDG, give it back, and
///      say how much it is holding fits behind this; a venue that is not ERC-4626
///      needs one adapter contract, not a change here.
///
///      THE RULE THIS INTERFACE EXISTS TO ENFORCE: withdrawing must work, now, up to
///      `maxWithdraw`. A pool that cannot pay a holder because its cash is off earning
///      somewhere else has taken a yield it was not offered, and the holder pays for
///      it. Every implementation is responsible for making `maxWithdraw` honest.
interface IIdleYield {
    /// @notice Take USDG and put it to work. Caller must have approved `amount`.
    function deposit(uint256 amount) external returns (uint256 deposited);

    /// @notice Return USDG to the caller. Must deliver exactly `amount` or revert.
    function withdraw(uint256 amount) external returns (uint256 withdrawn);

    /// @notice USDG this venue is holding for the caller, including anything earned.
    function totalAssets() external view returns (uint256);

    /// @notice Most that could be withdrawn right now. Never optimistic.
    function maxWithdraw() external view returns (uint256);
}
