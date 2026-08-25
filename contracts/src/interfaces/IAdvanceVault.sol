// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAdvanceVault
/// @notice ERC-4626 vault of USDG that fronts dividends before the issuer pays.
/// @dev Accounting model, in one place, because everything else follows from it:
///
///        totalAssets = cash + receivables - obligations
///
///      cash         USDG sitting in the vault.
///      receivables  Gross dividend the issuer will hand over at settlement.
///      obligations  Net dividend the vault still owes holders who advanced.
///
///      Booking an advance adds `gross` to receivables and `gross - fee` to
///      obligations, so totalAssets rises by exactly the fee at the moment the
///      risk is taken. Releasing cash moves cash and obligations down together.
///      Repayment moves cash up and receivables down. Every step is assets neutral
///      except the fee. LP share price only ever moves on fees and on losses.
interface IAdvanceVault {
    /// @notice The vault fronted a dividend.
    event AdvancePaid(uint256 indexed dividendId, address indexed user, uint256 gross, uint256 net, uint256 fee);

    /// @notice Cash left the vault against an already booked advance.
    event AdvanceReleased(uint256 indexed dividendId, address indexed to, uint256 amount);

    /// @notice The issuer settled and the vault was made whole.
    event AdvanceRepaid(uint256 indexed dividendId, uint256 amount);

    /// @notice Fee recognised as LP yield.
    event FeeAccrued(uint256 indexed dividendId, uint256 fee);

    /// @notice A voided dividend cost the LPs.
    event LossRecorded(uint256 indexed dividendId, uint256 amount);

    /// @notice Stock tokens seized from a defaulting position landed in the vault.
    event CollateralClawedBack(uint256 indexed dividendId, address indexed stockToken, uint256 amount);

    /// @notice Book an advance against a dividend and recognise the fee.
    /// @dev Moves no cash. Callable by CORE_ROLE only.
    /// @return net Gross minus the advance fee. This is what the holder is owed.
    function bookAdvance(uint256 dividendId, address user, uint256 gross) external returns (uint256 net);

    /// @notice Pay out cash against an advance already booked.
    /// @dev Callable by CORE_ROLE only. Reverts if it would exceed the booked obligation.
    function releaseAdvance(uint256 dividendId, address to, uint256 amount) external;

    /// @notice Repay the vault at settlement. Pulls USDG from the caller.
    /// @dev Callable by CORE_ROLE only.
    function repayAdvance(uint256 dividendId, uint256 amount) external;

    /// @notice Write down an unrecoverable advance on a voided dividend.
    /// @dev Callable by CORE_ROLE only. LPs eat whatever clawback could not recover.
    function recordLoss(uint256 dividendId, uint256 amount) external;

    /// @notice Accept seized stock tokens from DripCore during clawback.
    /// @dev Callable by CORE_ROLE only. Tokens are held for admin liquidation.
    function receiveClawback(uint256 dividendId, address stockToken, uint256 amount) external;

    /// @notice Cancel an obligation the holder can no longer draw (voided dividend).
    /// @dev Callable by CORE_ROLE only.
    function cancelObligation(uint256 dividendId, uint256 amount) external;

    /// @notice Gross dividend still owed to the vault by issuers.
    function receivables() external view returns (uint256);

    /// @notice Gross still owed to the vault against one dividend.
    function receivableOf(uint256 dividendId) external view returns (uint256);

    /// @notice Net still owed by the vault to holders against one dividend.
    function obligationOf(uint256 dividendId) external view returns (uint256);

    /// @notice Net dividend the vault still owes to holders.
    function obligations() external view returns (uint256);

    /// @notice Lifetime advance fees recognised.
    function totalFeesAccrued() external view returns (uint256);

    /// @notice Utilisation in basis points: receivables over total assets.
    function utilizationBps() external view returns (uint256);

    /// @notice Ceiling on utilisation. The vault is never fully lent out.
    function maxUtilizationBps() external view returns (uint256);

    /// @notice Advance fee in basis points. 100 = 1 percent.
    function advanceFeeBps() external view returns (uint256);
}
