// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISplitVault
/// @notice Splits a stock token into a Principal Token and a Yield Token.
/// @dev THE MECHANISM, stated once. A Robinhood Chain stock token pays no cash
///      dividend: the dividend is reinvested and ERC-8056's `uiMultiplier()` rises,
///      while the raw balance never moves. So the yield is the growth of that number,
///      and splitting it is arithmetic on the multiplier rather than a claim on a
///      payment somebody has to fund.
///
///        PT is denominated in SHARES.  Redeems `pt * 1e18 / M` raw at maturity,
///                                     which is exactly the shares it entered with.
///        YT is denominated in RAW.    Earns `yt * (M_now - M_entry) / 1e18` shares.
///
///      Those two add up to the whole deposit at any multiplier, for any mix of entry
///      points, which is the property the old design lacked: it handed PT the raw
///      tokens back, so the accretion left with the principal and YT was worth nothing.
///
///      PT and YT are minted in different units on purpose. A holder who splits one
///      raw token at a multiplier of 1.0006 gets 1.0006 PT and 1.0000 YT, because the
///      first is a claim on shares and the second is a claim on the growth of one
///      token. Quoting both in the same number would require lying about one of them.
///
///      Phase 1 constraint: one active series per stock token. A new series cannot
///      open until the prior one's PT supply is fully redeemed.
interface ISplitVault {
    /// @param stockToken     The stock token this series splits.
    /// @param maturity       Timestamp principal becomes redeemable and yield stops accruing.
    /// @param principalToken PT for this series, denominated in shares.
    /// @param yieldToken     YT for this series, denominated in raw stock tokens.
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
    event Split(
        uint256 indexed seriesId,
        address indexed user,
        uint256 rawIn,
        uint256 rawNet,
        uint256 ptMinted,
        uint256 multiplier,
        uint256 fee
    );
    event Merged(uint256 indexed seriesId, address indexed user, uint256 rawOut, uint256 ptBurned);
    event PrincipalRedeemed(uint256 indexed seriesId, address indexed user, uint256 ptBurned, uint256 rawOut);
    event YieldClaimed(uint256 indexed seriesId, address indexed user, uint256 shares, uint256 rawOut);
    event SplitFeeSet(uint256 bps);

    /// @notice Open a new series. Callable by KEEPER_ROLE.
    function createSeries(address stockToken, uint64 maturity) external returns (uint256 seriesId);

    /// @notice Deposit raw stock, mint PT in shares and YT in raw, net of the fee.
    function split(uint256 seriesId, uint256 rawAmount) external returns (uint256 ptMinted, uint256 ytMinted);

    /// @notice Burn PT and the YT beside it, reclaim the raw stock. Banked yield is kept.
    function merge(uint256 seriesId, uint256 ptAmount) external;

    /// @notice After maturity, burn PT alone for the shares it represents.
    function redeemPrincipal(uint256 seriesId, uint256 ptAmount) external returns (uint256 rawOut);

    /// @notice Take everything this YT has accrued, paid in the stock token itself.
    function claimYield(uint256 seriesId) external returns (uint256 rawOut);

    /// @notice What `user` could claim from this series right now, in raw stock tokens.
    function claimableYield(uint256 seriesId, address user) external view returns (uint256);

    /// @notice Raw stock one PT would redeem for at the current multiplier.
    function principalValue(uint256 seriesId, uint256 ptAmount) external view returns (uint256);

    function series(uint256 seriesId)
        external
        view
        returns (address stockToken, uint64 maturity, address principalToken, address yieldToken, bool exists);
}
