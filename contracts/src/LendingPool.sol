// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";

/// @notice The AdvanceVault surface the credit side uses.
/// @dev Declared here rather than widened on IAdvanceVault: the advance interface is
///      frozen and the frontend is built against it.
interface ILendableVault {
    function lend(address to, uint256 amount) external;
    function receiveRepayment(address from, uint256 principal, uint256 interest) external;
    function recordLoanLoss(uint256 amount) external;
    function loansOutstanding() external view returns (uint256);
    function freeCash() external view returns (uint256);
}

/// @notice The DripCore surface the credit side uses.
interface ICollateralCustodian {
    function tokensOf(address user) external view returns (address[] memory);
    function balanceOf(address user, address stockToken) external view returns (uint256);
    function seizeCollateral(address user, address stockToken, uint256 amount, address to) external;
}

/// @title LendingPool
/// @notice Borrow USDG against stock already on deposit, and let the dividends that
///         stock pays service the interest.
/// @dev The credit side of Osinko, specified in HANDOFF.md section 13. Aave's
///      economics with one difference that is the entire point of the product: income
///      the collateral produces is routed at the debt before it reaches the holder, so
///      at a conservative LTV the loan carries itself.
///
///      Three rules this contract does not bend:
///
///      1. Price from the oracle, never from a pool. A liquidation priced off a venue
///         is a liquidation an attacker can cause by moving that venue. The oracle
///         fails closed on a stale feed, and a stale feed therefore blocks new
///         borrowing AND blocks liquidation of the affected collateral — the safe
///         direction is refusing to act, not acting on a number nobody stands behind.
///      2. Interest accrues on an index, and is only recognised as an asset when it
///         arrives as cash. An accrual that inflates the LP share price before anyone
///         has paid is a way to pay early LPs with later LPs' money.
///      3. Collateral is never held here. DripCore custodies every share, before and
///         during a loan. This contract can lock it and, when a position is genuinely
///         underwater, seize it — nothing else.
contract LendingPool is ILendingPool, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Held by DripCore, which is the only caller allowed to service debt.
    bytes32 public constant CORE_ROLE = keccak256("CORE_ROLE");

    /// @dev Basis point denominator.
    uint256 private constant BPS = 10_000;

    /// @dev Index and rate fixed point. Rates are per second, scaled by this.
    uint256 private constant RAY = 1e27;

    uint256 private constant SECONDS_PER_YEAR = 365 days;

    /// @dev One whole stock token. Every listed stock is 18 decimals; the deploy
    ///      scripts refuse anything else.
    uint256 private constant ONE_STOCK = 1e18;

    // -- Risk parameters, and the ceilings an admin cannot raise them past ----

    /// @notice Most that can be borrowed against collateral, in bps. Section 13: 40%.
    uint256 public maxLtvBps = 4_000;

    /// @notice Debt above this share of collateral is liquidatable. Section 13: 65%.
    uint256 public liquidationThresholdBps = 6_500;

    /// @notice Extra collateral a liquidator receives, in bps. Section 13: 5%.
    uint256 public liquidationBonusBps = 500;

    /// @notice Most of a debt one liquidation may repay, in bps. Section 13: 50%.
    uint256 public closeFactorBps = 5_000;

    /// @dev A max LTV at or above the liquidation threshold means a loan is born
    ///      liquidatable. The setter refuses it; this is the outer bound on top.
    uint256 private constant MAX_LTV_CEILING_BPS = 7_500;
    uint256 private constant MAX_LIQ_THRESHOLD_CEILING_BPS = 9_000;
    uint256 private constant MAX_BONUS_BPS = 2_000;

    // -- Interest rate model, kinked ------------------------------------------

    /// @notice Rate at zero utilisation, in bps per year. Section 13: 2%.
    uint256 public baseRateBps = 200;

    /// @notice Additional rate reached at the kink, in bps per year. 2% + 6% = 8%.
    uint256 public slope1Bps = 600;

    /// @notice Additional rate from the kink to full utilisation, in bps per year.
    /// @dev Steep on purpose. Past the kink the vault is close to lent out, and the
    ///      rate has to be the thing that makes borrowers repay before LPs discover
    ///      they cannot withdraw.
    uint256 public slope2Bps = 10_000;

    /// @notice Utilisation at which slope2 takes over, in bps. Section 13: 80%.
    uint256 public kinkBps = 8_000;

    // -- State -----------------------------------------------------------------

    IERC20 public immutable usdg;
    ICollateralCustodian public immutable core;
    ILendableVault public immutable vault;

    /// @notice Reference price source. Chainlink in production.
    IPriceOracle public priceOracle;

    /// @notice Venue used to sell seized collateral. Oracle bounded, never consulted for price.
    ISwapAdapter public swapAdapter;

    /// @notice Debt scaled by the borrow index at the time it was taken on.
    mapping(address => uint256) public scaledDebt;

    /// @notice USDG principal actually drawn, before any interest.
    /// @dev Tracked separately from the index so interest and principal can be told
    ///      apart. Dividend servicing needs that distinction: section 13 routes income
    ///      at the interest, and only touches principal for holders who asked it to.
    mapping(address => uint256) public principalOf;

    /// @notice Holders who want dividend income to pay down principal, not just interest.
    /// @dev Off by default. Taking a holder's whole dividend to retire principal they
    ///      never asked to retire is a worse default than leaving them the cash: the
    ///      loan is serviced either way, and the surplus is theirs.
    mapping(address => bool) public autoRepayPrincipal;

    /// @notice Sum of every scaledDebt. Multiply by the index for total debt.
    uint256 public totalScaledDebt;

    /// @notice Compounding index for borrow interest, in RAY. Starts at 1.0.
    uint256 public borrowIndex = RAY;

    /// @notice When the index was last brought up to date.
    uint256 public lastAccrualTime;

    /// @notice Interest paid in cash over the life of the pool, for reporting.
    uint256 public totalInterestPaid;

    /// @notice USDG of this holder's dividend income that has gone at their debt.
    /// @dev The number the Borrow page leads with. Without it the app would have to
    ///      reconstruct it from event logs, which is slow, RPC dependent, and wrong the
    ///      moment a node prunes.
    mapping(address => uint256) public servicedFromDividends;

    event Borrowed(address indexed user, uint256 amount, uint256 debtAfter);
    event Repaid(address indexed user, address indexed payer, uint256 principal, uint256 interest, uint256 debtAfter);
    event DebtServicedFromDividends(address indexed user, uint256 amount, uint256 debtAfter);
    event Liquidated(
        address indexed user,
        address indexed liquidator,
        address indexed stockToken,
        uint256 repaid,
        uint256 seized
    );
    event Accrued(uint256 borrowIndex, uint256 interestAccrued);
    event AutoRepayPrincipalSet(address indexed user, bool enabled);
    event RiskParametersSet(uint256 maxLtvBps, uint256 liquidationThresholdBps, uint256 bonusBps, uint256 closeFactorBps);
    event RateModelSet(uint256 baseRateBps, uint256 slope1Bps, uint256 slope2Bps, uint256 kinkBps);
    event PriceOracleSet(address indexed oracle);
    event SwapAdapterSet(address indexed adapter);

    error ZeroAddress();
    error ZeroAmount();
    error NotEnoughCollateral(uint256 requested, uint256 available);
    error NoDebt(address user);
    error PositionHealthy(address user, uint256 healthFactorBps);
    error RepayTooLarge(uint256 requested, uint256 maxRepay);
    error WithdrawWouldUndercollateralise(uint256 debt, uint256 borrowingPowerAfter);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error ParameterOutOfRange();
    error NotServiceable(uint256 requested, uint256 due);
    error SeizeExceedsCollateral(uint256 needed, uint256 available);

    constructor(
        IERC20 usdg_,
        ICollateralCustodian core_,
        ILendableVault vault_,
        IPriceOracle oracle_,
        ISwapAdapter adapter_,
        address admin
    ) {
        if (
            address(usdg_) == address(0) || address(core_) == address(0) || address(vault_) == address(0)
                || address(oracle_) == address(0) || admin == address(0)
        ) revert ZeroAddress();

        usdg = usdg_;
        core = core_;
        vault = vault_;
        priceOracle = oracle_;
        swapAdapter = adapter_;
        lastAccrualTime = block.timestamp;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        emit PriceOracleSet(address(oracle_));
        emit SwapAdapterSet(address(adapter_));
    }

    // ---------------------------------------------------------------------
    // Interest accrual
    // ---------------------------------------------------------------------

    /// @notice Bring the borrow index up to the current block.
    /// @dev Called at the top of every state changing path. Linear within a block
    ///      interval, compounding across them — the standard approximation, and at
    ///      these rates the difference from continuous compounding is dust.
    function accrue() public {
        uint256 elapsed = block.timestamp - lastAccrualTime;
        if (elapsed == 0) return;

        uint256 debtBefore = totalDebt();
        if (debtBefore > 0) {
            uint256 ratePerSecond = (borrowRateBps() * RAY) / (BPS * SECONDS_PER_YEAR);
            uint256 growth = RAY + (ratePerSecond * elapsed);
            borrowIndex = (borrowIndex * growth) / RAY;
        }
        lastAccrualTime = block.timestamp;
        emit Accrued(borrowIndex, totalDebt() - debtBefore);
    }

    /// @notice Total USDG owed across every borrower, principal plus accrued interest.
    function totalDebt() public view returns (uint256) {
        return (totalScaledDebt * borrowIndex) / RAY;
    }

    /// @notice What one borrower owes right now.
    function debtOf(address user) public view returns (uint256) {
        return (scaledDebt[user] * borrowIndex) / RAY;
    }

    /// @notice Share of the vault's lendable capital currently drawn, in bps.
    function utilizationBps() public view returns (uint256) {
        uint256 borrowed = vault.loansOutstanding();
        uint256 available = vault.freeCash();
        uint256 total = borrowed + available;
        if (total == 0) return 0;
        return (borrowed * BPS) / total;
    }

    /// @notice The kinked curve, in bps per year.
    function borrowRateBps() public view returns (uint256) {
        uint256 u = utilizationBps();
        if (u <= kinkBps) {
            if (kinkBps == 0) return baseRateBps;
            return baseRateBps + (slope1Bps * u) / kinkBps;
        }
        uint256 excess = u - kinkBps;
        uint256 span = BPS - kinkBps;
        if (span == 0) return baseRateBps + slope1Bps + slope2Bps;
        return baseRateBps + slope1Bps + (slope2Bps * excess) / span;
    }

    // ---------------------------------------------------------------------
    // Collateral valuation
    // ---------------------------------------------------------------------

    /// @notice USDG value of everything `user` has on deposit in DripCore.
    /// @dev Reverts if any held token has no live price. That is deliberate: a
    ///      portfolio containing one unpriceable asset cannot be valued, and every
    ///      caller here would rather refuse than act on a partial number.
    function collateralValue(address user) public view returns (uint256 total) {
        address[] memory tokens = core.tokensOf(user);
        for (uint256 i = 0; i < tokens.length; ++i) {
            uint256 amount = core.balanceOf(user, tokens[i]);
            if (amount == 0) continue;
            total += (amount * priceOracle.priceUsdg(tokens[i])) / ONE_STOCK;
        }
    }

    /// @notice Most `user` could owe in total, given what they have on deposit.
    function borrowingPower(address user) public view returns (uint256) {
        return (collateralValue(user) * maxLtvBps) / BPS;
    }

    /// @notice Still drawable by `user` right now.
    function availableToBorrow(address user) public view returns (uint256) {
        uint256 power = borrowingPower(user);
        uint256 debt = debtOf(user);
        if (debt >= power) return 0;
        return Math.min(power - debt, vault.freeCash());
    }

    /// @notice Interest owed by `user` on top of the principal they drew.
    function accruedInterestOf(address user) public view returns (uint256) {
        uint256 debt = debtOf(user);
        uint256 principal = principalOf[user];
        return debt > principal ? debt - principal : 0;
    }

    /// @notice Choose whether dividend income also pays down principal.
    function setAutoRepayPrincipal(bool enabled) external {
        autoRepayPrincipal[msg.sender] = enabled;
        emit AutoRepayPrincipalSet(msg.sender, enabled);
    }

    /// @notice Collateral value at the liquidation threshold, over debt, in bps.
    /// @dev 10000 is the liquidation line. Above it the position is safe; at or below
    ///      it a liquidator may act. type(uint256).max when nothing is owed.
    function healthFactorBps(address user) public view returns (uint256) {
        uint256 debt = debtOf(user);
        if (debt == 0) return type(uint256).max;
        return (collateralValue(user) * liquidationThresholdBps) / debt;
    }

    // ---------------------------------------------------------------------
    // Borrow and repay
    // ---------------------------------------------------------------------

    /// @notice Draw USDG against stock already on deposit.
    function borrow(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        accrue();

        uint256 power = borrowingPower(msg.sender);
        uint256 debtAfter = debtOf(msg.sender) + amount;
        if (debtAfter > power) revert NotEnoughCollateral(debtAfter, power);

        uint256 liquidity = vault.freeCash();
        if (amount > liquidity) revert InsufficientLiquidity(amount, liquidity);

        // Round the scaled debt UP. Rounding down means the index converts it back to
        // slightly less than was handed over, so the borrower ends up owing less than
        // they received and the difference comes out of the LPs. A wei each time, in
        // one direction, forever. Repayment still rounds down, which errs the same
        // way: towards the vault.
        uint256 scaled = Math.ceilDiv(amount * RAY, borrowIndex);
        scaledDebt[msg.sender] += scaled;
        totalScaledDebt += scaled;
        principalOf[msg.sender] += amount;

        vault.lend(msg.sender, amount);
        emit Borrowed(msg.sender, amount, debtOf(msg.sender));
    }

    /// @notice Repay some or all of a debt. Anyone may repay for anyone.
    /// @param user   Whose debt is being repaid.
    /// @param amount USDG to apply, or type(uint256).max for the whole debt.
    function repay(address user, uint256 amount) external nonReentrant returns (uint256 repaid) {
        accrue();
        uint256 debt = debtOf(user);
        if (debt == 0) revert NoDebt(user);

        repaid = amount > debt ? debt : amount;
        if (repaid == 0) revert ZeroAmount();

        usdg.safeTransferFrom(msg.sender, address(this), repaid);
        _applyRepayment(user, repaid, msg.sender);
    }

    /// @dev Splits a payment into the principal the vault lent and the interest it
    ///      earned, retires the scaled debt, and hands both to the vault in one call.
    ///      Principal is what the loan book shrinks by; interest is LP yield the vault
    ///      recognises only now, in cash.
    function _applyRepayment(address user, uint256 amount, address payer) private {
        uint256 debt = debtOf(user);
        uint256 scaledRepaid = amount >= debt ? scaledDebt[user] : (amount * RAY) / borrowIndex;
        if (scaledRepaid > scaledDebt[user]) scaledRepaid = scaledDebt[user];

        scaledDebt[user] -= scaledRepaid;
        totalScaledDebt -= scaledRepaid;

        // Interest is retired before principal, so a payment smaller than the interest
        // owed leaves the principal untouched and the loan book unchanged.
        uint256 interest = Math.min(amount, debt > principalOf[user] ? debt - principalOf[user] : 0);
        uint256 principal = amount - interest;

        // Rounding in the index must never let a repayment claim to retire more of the
        // vault's loan book than the vault says exists.
        uint256 outstanding = vault.loansOutstanding();
        if (principal > outstanding) {
            interest += principal - outstanding;
            principal = outstanding;
        }

        principalOf[user] -= Math.min(principal, principalOf[user]);
        totalInterestPaid += interest;

        usdg.forceApprove(address(vault), amount);
        vault.receiveRepayment(address(this), principal, interest);
        usdg.forceApprove(address(vault), 0);

        emit Repaid(user, payer, principal, interest, debtOf(user));
    }

    // ---------------------------------------------------------------------
    // Dividend servicing. DripCore only.
    // ---------------------------------------------------------------------

    /// @inheritdoc ILendingPool
    /// @dev Interest first, and by default only interest. `available` bounds it, so a
    ///      dividend smaller than the interest owed simply pays what it can and the
    ///      rest keeps accruing. Holders who opted in let it run on into principal.
    function debtServiceDue(address user, uint256 available) external view returns (uint256) {
        uint256 debt = debtOf(user);
        if (debt == 0) return 0;
        uint256 target = autoRepayPrincipal[user] ? debt : accruedInterestOf(user);
        return Math.min(target, available);
    }

    /// @inheritdoc ILendingPool
    /// @dev CORE_ROLE, because this moves someone's dividend without their signature.
    ///      That is the deal the holder made when they borrowed against the position,
    ///      and it is why only the contract holding the collateral may invoke it.
    function serviceDebt(address user, uint256 amount) external onlyRole(CORE_ROLE) nonReentrant {
        accrue();
        uint256 debt = debtOf(user);
        if (debt == 0) revert NoDebt(user);
        if (amount == 0) revert ZeroAmount();
        uint256 target = autoRepayPrincipal[user] ? debt : accruedInterestOf(user);
        if (amount > target) revert NotServiceable(amount, target);

        usdg.safeTransferFrom(msg.sender, address(this), amount);
        _applyRepayment(user, amount, msg.sender);
        servicedFromDividends[user] += amount;
        emit DebtServicedFromDividends(user, amount, debtOf(user));
    }

    /// @inheritdoc ILendingPool
    /// @dev A view, so it cannot accrue first. It therefore judges on a slightly stale
    ///      index, which understates the debt by at most one block of interest and so
    ///      errs towards letting a withdrawal through. The alternative — refusing on an
    ///      interest amount too small to see — is worse for every honest holder, and
    ///      the liquidation path is what actually bounds the risk.
    function requireWithdrawAllowed(address user, address stockToken, uint256 amount) external view {
        uint256 debt = debtOf(user);
        if (debt == 0) return;

        uint256 value = collateralValue(user);
        uint256 leaving = (amount * priceOracle.priceUsdg(stockToken)) / ONE_STOCK;
        uint256 remaining = value > leaving ? value - leaving : 0;
        uint256 powerAfter = (remaining * maxLtvBps) / BPS;

        if (debt > powerAfter) revert WithdrawWouldUndercollateralise(debt, powerAfter);
    }

    /// @notice Everything the Borrow page needs, in one call.
    /// @dev Eight round trips over a rate limited public RPC is a visibly slow page.
    ///      Ordered to match the view model the app renders.
    function accountSnapshot(address user)
        external
        view
        returns (
            uint256 collateral,
            uint256 power,
            uint256 debt,
            uint256 available,
            uint256 interest,
            uint256 serviced,
            uint256 health,
            uint256 rateBps
        )
    {
        collateral = collateralValue(user);
        power = (collateral * maxLtvBps) / BPS;
        debt = debtOf(user);
        available = debt >= power ? 0 : Math.min(power - debt, vault.freeCash());
        interest = accruedInterestOf(user);
        serviced = servicedFromDividends[user];
        health = healthFactorBps(user);
        rateBps = borrowRateBps();
    }

    // ---------------------------------------------------------------------
    // Liquidation
    // ---------------------------------------------------------------------

    /// @notice Repay part of an unhealthy debt and take collateral plus a bonus.
    /// @param user       The borrower being liquidated.
    /// @param stockToken Which of their collateral tokens to seize.
    /// @param repayAmount USDG to repay, capped by the close factor.
    function liquidate(address user, address stockToken, uint256 repayAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 seized)
    {
        accrue();

        uint256 health = healthFactorBps(user);
        if (health > BPS) revert PositionHealthy(user, health);

        uint256 debt = debtOf(user);
        uint256 maxRepay = (debt * closeFactorBps) / BPS;
        if (repayAmount > maxRepay) revert RepayTooLarge(repayAmount, maxRepay);
        if (repayAmount == 0) revert ZeroAmount();

        // Priced from the oracle. A stale feed reverts here, which blocks the
        // liquidation rather than settling it at a price nobody stands behind.
        uint256 price = priceOracle.priceUsdg(stockToken);
        seized = (repayAmount * (BPS + liquidationBonusBps) * ONE_STOCK) / (price * BPS);

        uint256 held = core.balanceOf(user, stockToken);
        if (seized > held) revert SeizeExceedsCollateral(seized, held);

        usdg.safeTransferFrom(msg.sender, address(this), repayAmount);
        _applyRepayment(user, repayAmount, msg.sender);
        core.seizeCollateral(user, stockToken, seized, msg.sender);

        emit Liquidated(user, msg.sender, stockToken, repayAmount, seized);
    }

    /// @notice Write off debt that collateral can no longer cover.
    /// @dev Admin only, and a last resort: when a position's collateral is exhausted
    ///      and debt remains, someone has to recognise the loss or the vault carries a
    ///      receivable that will never arrive. Section 13's invariant is that the
    ///      vault's assets are honest, not that they are always whole.
    function writeOffBadDebt(address user) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 written) {
        accrue();
        written = debtOf(user);
        if (written == 0) revert NoDebt(user);
        if (collateralValue(user) != 0) revert PositionHealthy(user, healthFactorBps(user));

        totalScaledDebt -= scaledDebt[user];
        scaledDebt[user] = 0;
        uint256 principal = principalOf[user];
        principalOf[user] = 0;

        // Only principal was ever booked as a vault asset; the unpaid interest never
        // was, so writing it off costs the share price nothing it had already counted.
        uint256 outstanding = vault.loansOutstanding();
        vault.recordLoanLoss(Math.min(principal, outstanding));
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setRiskParameters(uint256 maxLtv, uint256 liqThreshold, uint256 bonus, uint256 closeFactor)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // A max LTV at or above the threshold mints positions that are liquidatable
        // the moment they open. The ordering, not just the ceilings, is the guard.
        if (maxLtv == 0 || maxLtv >= liqThreshold) revert ParameterOutOfRange();
        if (maxLtv > MAX_LTV_CEILING_BPS) revert ParameterOutOfRange();
        if (liqThreshold > MAX_LIQ_THRESHOLD_CEILING_BPS) revert ParameterOutOfRange();
        if (bonus > MAX_BONUS_BPS) revert ParameterOutOfRange();
        if (closeFactor == 0 || closeFactor > BPS) revert ParameterOutOfRange();

        accrue();
        maxLtvBps = maxLtv;
        liquidationThresholdBps = liqThreshold;
        liquidationBonusBps = bonus;
        closeFactorBps = closeFactor;
        emit RiskParametersSet(maxLtv, liqThreshold, bonus, closeFactor);
    }

    function setRateModel(uint256 base, uint256 slope1, uint256 slope2, uint256 kink)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (kink == 0 || kink >= BPS) revert ParameterOutOfRange();
        // 200% all in. Past that the curve stops being a rate and starts being a
        // confiscation, and no borrower could repay their way out of it.
        if (base + slope1 + slope2 > 20_000) revert ParameterOutOfRange();

        accrue();
        baseRateBps = base;
        slope1Bps = slope1;
        slope2Bps = slope2;
        kinkBps = kink;
        emit RateModelSet(base, slope1, slope2, kink);
    }

    function setPriceOracle(IPriceOracle oracle_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(oracle_) == address(0)) revert ZeroAddress();
        priceOracle = oracle_;
        emit PriceOracleSet(address(oracle_));
    }

    function setSwapAdapter(ISwapAdapter adapter_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        swapAdapter = adapter_;
        emit SwapAdapterSet(address(adapter_));
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
