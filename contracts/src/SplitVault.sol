// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISplitVault} from "./interfaces/ISplitVault.sol";
import {IScaledUI} from "./interfaces/IScaledUI.sol";
import {PrincipalToken} from "./PrincipalToken.sol";
import {YieldToken} from "./YieldToken.sol";

/// @title SplitVault
/// @notice Separates a stock token from its dividends, on chain, funded by the asset.
/// @dev THE ACCOUNTING IDENTITY, stated once, loudly:
///
///        heldRaw(stock) >= ptSupply * 1e18 / M  +  unclaimed YT accrual
///
///      A Robinhood Chain stock token reinvests its dividends into ERC-8056's
///      `uiMultiplier()`; the raw balance never moves. So a series holds raw tokens
///      whose share count grows on its own, and the split is a rule for who owns
///      which part of that growth:
///
///        PT holds SHARES.  `pt` PT redeems `pt * 1e18 / M` raw — exactly the share
///                          count it was minted against, whatever M has done since.
///        YT holds RAW.     `yt` YT earns `yt * (M_now - M_entry) / 1e18` shares, the
///                          growth that happened while it was held.
///
///      Those sum to the deposit at every multiplier and for every mix of entry
///      points. The design this replaces returned raw tokens to PT, so the accretion
///      walked out with the principal and YT could never be worth anything.
///
///      Nothing here needs a declared dividend, a settlement, or a keeper's USDG. The
///      old path required Osinko to fund every payout from its own wallet, because a
///      cash dividend that never arrives cannot be redistributed. This one takes the
///      yield from where it actually is.
///
///      Phase 1 constraint: one active series per stock token, so this contract's raw
///      balance for a stock is always exactly one series' backing and no cross series
///      proration is needed anywhere below.
contract SplitVault is ISplitVault, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Opens series and may pause.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 private constant BPS = 10_000;
    uint256 private constant ONE = 1e18;

    /// @dev Ceiling on the split fee, matching AdvanceVault's advance fee ceiling.
    uint256 public constant MAX_SPLIT_FEE_BPS = 100;

    /// @notice Fee taken from stock deposited on split, in basis points.
    uint256 public splitFeeBps = 10;

    uint256 public seriesCount;
    mapping(uint256 => Series) private _series;

    /// @dev stockToken => the one series currently open for it, or 0 for none.
    mapping(address => uint256) public activeSeriesOf;

    /// @dev Split fee stock, held here and withdrawable by the admin.
    mapping(address => uint256) public feesOwed;

    error ZeroAddress();
    error ZeroAmount();
    error FeeTooHigh(uint256 bps, uint256 max);
    error SeriesNotFound(uint256 seriesId);
    error MaturityInPast(uint64 maturity);
    error SeriesStillActive(uint256 priorSeriesId, address stockToken);
    error NotMatured(uint256 seriesId, uint64 maturity);
    error AlreadyMatured(uint256 seriesId, uint64 maturity);
    error NothingToClaim();
    error NoMultiplier(address stockToken);
    error InsufficientBacking(uint256 needed, uint256 held);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // The multiplier
    // ---------------------------------------------------------------------

    /// @notice Shares per raw token for a stock, 18 decimals.
    /// @dev Refuses rather than assuming 1e18 on a token that does not implement
    ///      ERC-8056. Defaulting would silently hand every share of accretion to PT
    ///      and quietly make YT worthless — the exact bug this contract exists to fix,
    ///      reintroduced as a fallback.
    function multiplierOf(address stockToken) public view returns (uint256) {
        try IScaledUI(stockToken).uiMultiplier() returns (uint256 m) {
            if (m == 0) revert NoMultiplier(stockToken);
            return m;
        } catch {
            revert NoMultiplier(stockToken);
        }
    }

    /// @notice The multiplier a series settles against: live, or frozen at maturity.
    function seriesIndex(uint256 seriesId) public view returns (uint256) {
        Series memory s = _get(seriesId);
        uint256 frozen = YieldToken(s.yieldToken).frozenIndex();
        return frozen != 0 ? frozen : multiplierOf(s.stockToken);
    }

    // ---------------------------------------------------------------------
    // Series lifecycle
    // ---------------------------------------------------------------------

    /// @inheritdoc ISplitVault
    function createSeries(address stockToken, uint64 maturity)
        external
        onlyRole(KEEPER_ROLE)
        returns (uint256 seriesId)
    {
        if (stockToken == address(0)) revert ZeroAddress();
        if (maturity <= block.timestamp) revert MaturityInPast(maturity);
        // Read it now so a token without a multiplier cannot be listed at all, rather
        // than reverting later on the first split somebody attempts.
        multiplierOf(stockToken);

        uint256 prior = activeSeriesOf[stockToken];
        if (prior != 0 && PrincipalToken(_series[prior].principalToken).totalSupply() != 0) {
            revert SeriesStillActive(prior, stockToken);
        }

        seriesId = ++seriesCount;
        string memory suffix = _toString(seriesId);
        PrincipalToken pt =
            new PrincipalToken(string.concat("Osinko Principal ", suffix), string.concat("p", suffix));
        YieldToken yt = new YieldToken(
            string.concat("Osinko Yield ", suffix), string.concat("y", suffix), IScaledUI(stockToken), maturity
        );

        _series[seriesId] = Series({
            stockToken: stockToken,
            maturity: maturity,
            principalToken: address(pt),
            yieldToken: address(yt),
            exists: true
        });
        activeSeriesOf[stockToken] = seriesId;

        emit SeriesCreated(seriesId, stockToken, maturity, address(pt), address(yt));
    }

    // ---------------------------------------------------------------------
    // Split / merge / redeem
    // ---------------------------------------------------------------------

    /// @inheritdoc ISplitVault
    /// @dev PT is minted against the SHARES the deposit represents right now, YT
    ///      against the raw tokens. That is the whole trick: PT's claim is fixed in
    ///      shares so it is untouched by later growth, and YT's index starts at
    ///      today's multiplier so it earns only what happens from here.
    function split(uint256 seriesId, uint256 rawAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 ptMinted, uint256 ytMinted)
    {
        Series memory s = _get(seriesId);
        if (rawAmount == 0) revert ZeroAmount();
        // Past maturity a YT has nothing left to earn; only redeem and claim apply.
        if (block.timestamp >= s.maturity) revert AlreadyMatured(seriesId, s.maturity);

        uint256 m = multiplierOf(s.stockToken);
        uint256 fee = (rawAmount * splitFeeBps) / BPS;
        ytMinted = rawAmount - fee;
        ptMinted = (ytMinted * m) / ONE;

        feesOwed[s.stockToken] += fee;
        IERC20(s.stockToken).safeTransferFrom(msg.sender, address(this), rawAmount);

        PrincipalToken(s.principalToken).mint(msg.sender, ptMinted);
        YieldToken(s.yieldToken).mint(msg.sender, ytMinted);

        emit Split(seriesId, msg.sender, rawAmount, ytMinted, ptMinted, m, fee);
    }

    /// @inheritdoc ISplitVault
    /// @dev Takes a PT amount, not a raw amount, because PT is the scarcer leg once
    ///      the multiplier has moved: a holder who split one raw token at 1.00 holds
    ///      1.00 PT, and asking them for `raw * M` PT to undo it would demand more
    ///      than the split ever gave them. `pt` PT is `pt` shares is `pt / M` raw, so
    ///      that is the raw returned and the YT retired alongside it.
    ///
    ///      Yield already banked is untouched. Burning YT stops it earning more; it
    ///      does not forfeit what it earned.
    function merge(uint256 seriesId, uint256 ptAmount) external nonReentrant whenNotPaused {
        Series memory s = _get(seriesId);
        if (ptAmount == 0) revert ZeroAmount();

        uint256 m = seriesIndex(seriesId);
        uint256 rawOut = (ptAmount * ONE) / m;
        if (rawOut == 0) revert ZeroAmount();

        // Settle before burning so the YT being retired banks its growth first.
        YieldToken(s.yieldToken).settle(msg.sender);
        PrincipalToken(s.principalToken).burn(msg.sender, ptAmount);
        YieldToken(s.yieldToken).burn(msg.sender, rawOut);

        _payOut(s.stockToken, msg.sender, rawOut);
        emit Merged(seriesId, msg.sender, rawOut, ptAmount);
    }

    /// @inheritdoc ISplitVault
    /// @dev `pt * 1e18 / M` is the raw amount that holds exactly `pt` shares today —
    ///      the same share count the PT was minted against. The holder is made whole
    ///      in the thing they actually owned, and the difference between that and the
    ///      raw they put in is precisely the dividend, which belongs to YT.
    function redeemPrincipal(uint256 seriesId, uint256 ptAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 rawOut)
    {
        Series memory s = _get(seriesId);
        if (ptAmount == 0) revert ZeroAmount();
        if (block.timestamp < s.maturity) revert NotMatured(seriesId, s.maturity);

        // Stop the clock before computing anything: an unfrozen expired series keeps
        // accruing to YT out of exactly this principal.
        YieldToken(s.yieldToken).freeze();
        uint256 m = seriesIndex(seriesId);

        rawOut = (ptAmount * ONE) / m;
        PrincipalToken(s.principalToken).burn(msg.sender, ptAmount);
        _payOut(s.stockToken, msg.sender, rawOut);

        emit PrincipalRedeemed(seriesId, msg.sender, ptAmount, rawOut);
    }

    // ---------------------------------------------------------------------
    // Yield
    // ---------------------------------------------------------------------

    /// @notice Stop a matured series' yield clock. Permissionless and idempotent.
    /// @dev Every path that pays anyone out calls this first, so a holder cannot be
    ///      short-changed by an unfrozen series. But between maturity and the first
    ///      touch, a dividend that lands would still accrue to YT out of principal —
    ///      so the keeper freezes at maturity rather than waiting for a holder to
    ///      arrive. That is a real window, and it is why this is exposed at all.
    function freezeSeries(uint256 seriesId) external {
        YieldToken(_get(seriesId).yieldToken).freeze();
    }

    /// @inheritdoc ISplitVault
    /// @dev Paid in the stock token, because that is what the dividend was reinvested
    ///      into. Converting to USDG here would need a swap, a price and a slippage
    ///      policy to hand somebody the asset they already had.
    function claimYield(uint256 seriesId) external nonReentrant whenNotPaused returns (uint256 rawOut) {
        Series memory s = _get(seriesId);
        uint256 shares = YieldToken(s.yieldToken).drawAccrued(msg.sender);
        if (shares == 0) revert NothingToClaim();

        uint256 m = seriesIndex(seriesId);
        rawOut = (shares * ONE) / m;
        if (rawOut == 0) revert NothingToClaim();

        _payOut(s.stockToken, msg.sender, rawOut);
        emit YieldClaimed(seriesId, msg.sender, shares, rawOut);
    }

    /// @inheritdoc ISplitVault
    function claimableYield(uint256 seriesId, address user) external view returns (uint256) {
        Series memory s = _get(seriesId);
        uint256 shares = YieldToken(s.yieldToken).previewAccrued(user);
        if (shares == 0) return 0;
        return (shares * ONE) / seriesIndex(seriesId);
    }

    /// @inheritdoc ISplitVault
    function principalValue(uint256 seriesId, uint256 ptAmount) external view returns (uint256) {
        return (ptAmount * ONE) / seriesIndex(seriesId);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setSplitFee(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_SPLIT_FEE_BPS) revert FeeTooHigh(bps, MAX_SPLIT_FEE_BPS);
        splitFeeBps = bps;
        emit SplitFeeSet(bps);
    }

    /// @notice Sweep collected split fees.
    /// @dev Only ever the fee ledger, never a bare balance sweep: the rest of this
    ///      contract's stock is somebody's principal or somebody's yield.
    function collectFees(address stockToken, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = feesOwed[stockToken];
        if (amount == 0) revert ZeroAmount();
        feesOwed[stockToken] = 0;
        IERC20(stockToken).safeTransfer(to, amount);
    }

    function pause() external onlyRole(KEEPER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views and internals
    // ---------------------------------------------------------------------

    /// @inheritdoc ISplitVault
    function series(uint256 seriesId)
        external
        view
        returns (address stockToken, uint64 maturity, address principalToken, address yieldToken, bool exists)
    {
        Series memory s = _series[seriesId];
        return (s.stockToken, s.maturity, s.principalToken, s.yieldToken, s.exists);
    }

    /// @dev Never pay out of the fee ledger. Fees are the admin's; everything else
    ///      backs a PT or a YT, and a payout that dipped into fees would silently
    ///      leave the last redeemer short.
    function _payOut(address stockToken, address to, uint256 amount) private {
        uint256 held = IERC20(stockToken).balanceOf(address(this));
        uint256 free = held > feesOwed[stockToken] ? held - feesOwed[stockToken] : 0;
        if (amount > free) revert InsufficientBacking(amount, free);
        IERC20(stockToken).safeTransfer(to, amount);
    }

    function _get(uint256 seriesId) private view returns (Series memory s) {
        s = _series[seriesId];
        if (!s.exists) revert SeriesNotFound(seriesId);
    }

    function _toString(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 digits;
        for (uint256 t = v; t != 0; t /= 10) ++digits;
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            buf[--digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }
}
