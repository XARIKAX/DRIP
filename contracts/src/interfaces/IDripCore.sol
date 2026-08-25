// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Mode} from "./DripTypes.sol";

/// @title IDripCore
/// @notice Custody, eligibility and routing. Every user flow starts here.
/// @dev Design decision, stated loudly because it shapes the whole protocol:
///      only stock tokens deposited in DripCore before the ex date are eligible.
///      The protocol never tries to snapshot balances sitting in external wallets.
///      That removes the need for a snapshotting ERC-20, removes any dependency on
///      the stock token implementation, and makes eligibility provable from this
///      contract's own checkpoint history. The cost is that holders must opt in by
///      depositing. That is the trade the product makes.
interface IDripCore {
    /// @param amount     Stock tokens currently held for the user.
    /// @param mode       What the user wants done with dividends on this token.
    /// @param initialized Set on first deposit so mode defaults are written once, explicitly.
    struct Position {
        uint256 amount;
        Mode mode;
        bool initialized;
    }

    /// @param gross      Full USDG entitlement before any advance fee.
    /// @param net        What the holder actually receives after the advance fee.
    /// @param mode       Mode captured at activation. Later mode changes do not rewrite history.
    /// @param streamId   Stream opened for STREAM and REINVEST. Zero for CASH_EARLY.
    /// @param activated  Set once the entitlement has been routed.
    /// @param claimed    Set when a post settlement holder took their money the slow way.
    /// @param clawedBack Set once a voided advance has been recovered from collateral.
    struct Entitlement {
        uint256 gross;
        uint256 net;
        Mode mode;
        uint256 streamId;
        bool activated;
        bool claimed;
        bool clawedBack;
    }

    event Deposited(address indexed user, address indexed stockToken, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, address indexed stockToken, uint256 amount, uint256 newBalance);
    event ModeSet(address indexed user, address indexed stockToken, Mode mode);
    event EntitlementCreated(
        address indexed user, address indexed stockToken, uint256 indexed dividendId, uint256 gross, Mode mode
    );
    event EntitlementActivated(
        address indexed user, uint256 indexed dividendId, Mode mode, uint256 netPaid, uint256 streamId
    );
    event SettledDividendFunded(uint256 indexed dividendId, uint256 totalPaid, uint256 repaidToVault);
    event SettledEntitlementClaimed(address indexed user, uint256 indexed dividendId, uint256 amount);
    event Reinvested(address indexed user, address indexed stockToken, uint256 tokensOut, uint256 newBalance);
    event ClawedBack(address indexed user, uint256 indexed dividendId, uint256 tokensSeized, uint256 usdgShortfall);

    /// @notice Deposit stock tokens and start earning dividends the new way.
    function deposit(address stockToken, uint256 amount) external;

    /// @notice Withdraw stock tokens. Reduces eligibility for dividends not yet declared.
    function withdraw(address stockToken, uint256 amount) external;

    /// @notice Choose what happens to dividends on a token.
    function setMode(address stockToken, Mode mode) external;

    /// @notice Route a declared dividend for a holder. Anyone may call for any holder.
    /// @dev Permissionless on purpose: a keeper, the holder, or the UI can all trigger it,
    ///      and the money can only ever go to the holder.
    function activate(uint256 dividendId, address user) external returns (uint256 net, uint256 streamId);

    /// @notice Activate many holders on one dividend. Callable by anyone, skips the impossible.
    function activateBatch(uint256 dividendId, address[] calldata users) external;

    /// @notice Fund a settled dividend. Pulls the full eligible amount of USDG from the caller.
    /// @dev Callable by KEEPER_ROLE. Testnet: an admin pays. Production: the issuer's
    ///      settlement pipe pays, and this is the only place real dividend cash enters.
    function settleDividend(uint256 dividendId) external;

    /// @notice Take a settled dividend the slow way, with no fee, for holders who never activated.
    function claimSettled(uint256 dividendId) external returns (uint256 amount);

    /// @notice Credit reinvested stock tokens back into a position. Callable by REINVESTOR_ROLE.
    function creditReinvest(address user, address stockToken, uint256 amount) external;

    /// @notice Recover an advance on a voided dividend from the holder's collateral.
    function clawback(uint256 dividendId, address user) external;

    /// @notice Stock tokens a holder has on deposit.
    function balanceOf(address user, address stockToken) external view returns (uint256);

    /// @notice Balance the holder had at a past timestamp. This is the eligibility proof.
    function balanceOfAt(address user, address stockToken, uint64 timestamp) external view returns (uint256);

    /// @notice Protocol wide deposits of a stock token at a past timestamp.
    function totalDepositedAt(address stockToken, uint64 timestamp) external view returns (uint256);

    /// @notice Position record for a holder and token.
    function positionOf(address user, address stockToken) external view returns (Position memory);

    /// @notice Entitlement record for a holder and dividend.
    function entitlementOf(uint256 dividendId, address user) external view returns (Entitlement memory);

    /// @notice What a holder would receive gross if the dividend were activated now.
    function pendingEntitlement(uint256 dividendId, address user) external view returns (uint256);

    /// @notice Every stock token this holder has ever deposited. Drives the portfolio view.
    function tokensOf(address user) external view returns (address[] memory);

    /// @notice Protocol wide deposits of a stock token right now.
    function totalDeposited(address stockToken) external view returns (uint256);
}
