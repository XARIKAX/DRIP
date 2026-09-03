// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISplitVault
/// @notice Splits a stock token into a Principal Token (the share, redeemable for
///         the stock at maturity) and a Yield Token (the drip between now and
///         maturity, tradable on its own). The Pendle-shaped half of the product:
///         Early, Stream, Reinvest and Borrow never wrap the share; Split is the
///         one module that does, for holders who specifically want the dividend
///         itself to be a liquid, tradable position rather than a stream or a loan.
/// @dev Phase 1 constraint, stated once, loudly: one active series per stock
///      token. A new series cannot open until the prior one's Principal Token
///      supply is fully redeemed to zero. That keeps this contract's entire
///      DripCore balance for a stock token equal to exactly one series' backing
///      at any moment, which is what makes the accounting below provably correct
///      without a second layer of cross-series proration. Production wanting
///      concurrent maturities on the same stock needs a per-series sub-account
///      (e.g. a minimal proxy that itself deposits into DripCore) — see HANDOFF.md.
interface ISplitVault {
    /// @param stockToken     The stock token this series splits.
    /// @param maturity       Timestamp principal becomes redeemable and yield stops accruing.
    /// @param principalToken PT for this series. Redeemable 1:1 for stockToken at maturity.
    /// @param yieldToken     YT for this series. Right to every dividend harvested before maturity.
    /// @param exists         Set on creation so id 0 reads as "no series".
    struct Series {
        address stockToken;
        uint64 maturity;
        address principalToken;
        address yieldToken;
        bool exists;
    }

    event SeriesCreated(
        uint256 indexed seriesId,
        address indexed stockToken,
        uint64 maturity,
        address principalToken,
        address yieldToken
    );
    event Split(uint256 indexed seriesId, address indexed user, uint256 amountIn, uint256 minted, uint256 fee);
    event Merged(uint256 indexed seriesId, address indexed user, uint256 amount);
    event PrincipalRedeemed(uint256 indexed seriesId, address indexed user, uint256 amount);
    event DividendHarvested(uint256 indexed seriesId, uint256 indexed dividendId, uint256 netUsdg, uint256 ytSupplyAtExDate);
    event YieldClaimed(uint256 indexed seriesId, uint256 indexed dividendId, address indexed user, uint256 amount);
    event SplitFeeSet(uint256 bps);

    /// @notice Open a new series. Callable by KEEPER_ROLE.
    function createSeries(address stockToken, uint64 maturity) external returns (uint256 seriesId);

    /// @notice Deposit stock, mint PT and YT 1:1 net of the split fee.
    function split(uint256 seriesId, uint256 amount) external returns (uint256 minted);

    /// @notice Burn equal PT and YT, reclaim the whole stock token. Free, always, before maturity.
    function merge(uint256 seriesId, uint256 amount) external;

    /// @notice After maturity, burn PT alone for the underlying stock token.
    function redeemPrincipal(uint256 seriesId, uint256 amount) external;

    /// @notice Pull a declared dividend into the series' yield pool. Permissionless.
    function harvestDividend(uint256 seriesId, uint256 dividendId) external returns (uint256 net);

    /// @notice Claim a YT holder's pro-rata share of a harvested dividend.
    function claimYield(uint256 seriesId, uint256 dividendId) external returns (uint256 amount);

    /// @notice What a holder could still claim from an already harvested dividend.
    function pendingYield(uint256 seriesId, uint256 dividendId, address user) external view returns (uint256);

    /// @notice Set the split fee. Callable by DEFAULT_ADMIN_ROLE. Capped at MAX_SPLIT_FEE_BPS.
    function setSplitFeeBps(uint256 bps) external;
}
