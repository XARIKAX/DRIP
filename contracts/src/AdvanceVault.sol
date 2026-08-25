// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAdvanceVault} from "./interfaces/IAdvanceVault.sol";

/// @title AdvanceVault
/// @notice The yield side. LPs deposit USDG, the vault fronts dividends before the
///         issuer pays, and keeps the advance fee.
/// @dev The whole contract is one accounting identity:
///
///          totalAssets = cash + receivables - obligations
///
///      cash        USDG held here.
///      receivables Gross dividend an issuer owes the vault at settlement.
///      obligations Net dividend the vault still owes holders it advanced to.
///
///      Booking an advance adds gross to receivables and gross-fee to obligations,
///      so total assets rise by exactly the fee at the moment risk is taken.
///      Releasing cash to a holder decrements cash and obligations together, which
///      is assets neutral. Settlement raises cash and drops receivables, also
///      neutral. Only fees and losses move the share price.
///
///      Two hard limits stand between LPs and a bad oracle:
///        1. Utilisation cap. Receivables may never exceed maxUtilizationBps of
///           total assets, so the vault is never fully lent.
///        2. Cash floor. Booking reverts unless cash covers every obligation, so a
///           holder mid stream can always be paid.
contract AdvanceVault is IAdvanceVault, ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Held by DripCore, StreamEngine and Reinvestor. The only callers that move protocol money.
    bytes32 public constant CORE_ROLE = keccak256("CORE_ROLE");

    /// @dev Basis point denominator.
    uint256 private constant BPS = 10_000;

    /// @dev Advance fee ceiling. 5 percent. Prevents an admin from confiscating a dividend.
    uint256 private constant MAX_FEE_BPS = 500;

    /// @dev Utilisation ceiling ceiling. Even a maximally aggressive admin leaves 5 percent unlent.
    uint256 private constant MAX_UTILIZATION_CEILING_BPS = 9_500;

    /// @param receivable Gross still owed to the vault by the issuer.
    /// @param obligation Net still owed by the vault to the holder.
    /// @param fee        Fee recognised when the advance was booked.
    /// @param grossBooked Lifetime gross booked, for reporting.
    struct Book {
        uint256 receivable;
        uint256 obligation;
        uint256 fee;
        uint256 grossBooked;
    }

    /// @inheritdoc IAdvanceVault
    uint256 public receivables;

    /// @inheritdoc IAdvanceVault
    uint256 public obligations;

    /// @inheritdoc IAdvanceVault
    uint256 public totalFeesAccrued;

    /// @notice Lifetime losses written off against voided dividends.
    uint256 public totalLosses;

    /// @inheritdoc IAdvanceVault
    uint256 public advanceFeeBps;

    /// @inheritdoc IAdvanceVault
    uint256 public maxUtilizationBps;

    /// @notice Per dividend advance book.
    mapping(uint256 => Book) public books;

    /// @notice Stock tokens seized during clawback, awaiting admin liquidation.
    mapping(address => uint256) public seizedCollateral;

    event AdvanceFeeSet(uint256 bps);
    event MaxUtilizationSet(uint256 bps);
    event CollateralLiquidated(address indexed stockToken, address indexed to, uint256 amount);

    error FeeTooHigh(uint256 bps);
    error UtilizationTooHigh(uint256 bps);
    error UtilizationCapBreached(uint256 wouldBe, uint256 cap);
    error InsufficientCashFloor(uint256 cash, uint256 obligationsAfter);
    error ObligationExceeded(uint256 requested, uint256 available);
    error ReceivableExceeded(uint256 requested, uint256 available);
    error ZeroAmount();
    error ZeroAddress();

    /// @param usdg  Settlement asset. Six decimals in production.
    /// @param admin DEFAULT_ADMIN_ROLE holder.
    constructor(IERC20 usdg, address admin)
        ERC4626(usdg)
        ERC20("DRIP Advance Vault USDG", "advUSDG")
    {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        advanceFeeBps = 100; // 1 percent
        maxUtilizationBps = 8_000; // 80 percent
        emit AdvanceFeeSet(advanceFeeBps);
        emit MaxUtilizationSet(maxUtilizationBps);
    }

    // ---------------------------------------------------------------------
    // ERC-4626 surface
    // ---------------------------------------------------------------------

    /// @inheritdoc ERC4626
    /// @dev Cash plus what issuers owe us minus what we owe holders. Saturates at zero
    ///      so a catastrophic write down can never make the vault unreadable.
    function totalAssets() public view override returns (uint256) {
        uint256 gross = IERC20(asset()).balanceOf(address(this)) + receivables;
        uint256 owed = obligations;
        return gross > owed ? gross - owed : 0;
    }

    /// @notice USDG sitting in the vault right now.
    function cash() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Cash not already earmarked for an outstanding advance obligation.
    function freeCash() public view returns (uint256) {
        uint256 c = cash();
        return c > obligations ? c - obligations : 0;
    }

    /// @inheritdoc ERC4626
    /// @dev LPs can only pull what is not earmarked. Advanced capital is illiquid until settlement.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), freeCash());
    }

    /// @inheritdoc ERC4626
    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 byCash = _convertToShares(freeCash(), Math.Rounding.Floor);
        return Math.min(super.maxRedeem(owner), byCash);
    }

    /// @inheritdoc ERC4626
    function maxDeposit(address) public view override returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    /// @inheritdoc ERC4626
    function maxMint(address) public view override returns (uint256) {
        return paused() ? 0 : type(uint256).max;
    }

    /// @dev Virtual share offset on top of the OZ default. Kills the classic
    ///      first depositor inflation attack outright.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    /// @inheritdoc ERC4626
    function deposit(uint256 assets, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    /// @inheritdoc ERC4626
    function mint(uint256 shares, address receiver) public override whenNotPaused nonReentrant returns (uint256) {
        return super.mint(shares, receiver);
    }

    /// @inheritdoc ERC4626
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    /// @inheritdoc ERC4626
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        return super.redeem(shares, receiver, owner);
    }

    // ---------------------------------------------------------------------
    // Advance lifecycle. CORE_ROLE only.
    // ---------------------------------------------------------------------

    /// @inheritdoc IAdvanceVault
    function bookAdvance(uint256 dividendId, address user, uint256 gross)
        external
        onlyRole(CORE_ROLE)
        whenNotPaused
        returns (uint256 net)
    {
        if (gross == 0) revert ZeroAmount();

        uint256 fee = (gross * advanceFeeBps) / BPS;
        net = gross - fee;

        uint256 receivablesAfter = receivables + gross;
        uint256 obligationsAfter = obligations + net;

        // Cash floor: every holder we owe must be payable today, not eventually.
        uint256 c = cash();
        if (c < obligationsAfter) revert InsufficientCashFloor(c, obligationsAfter);

        // Utilisation cap: the vault is never fully lent out.
        uint256 assetsAfter = c + receivablesAfter - obligationsAfter;
        uint256 utilAfter = assetsAfter == 0 ? type(uint256).max : (receivablesAfter * BPS) / assetsAfter;
        if (utilAfter > maxUtilizationBps) revert UtilizationCapBreached(utilAfter, maxUtilizationBps);

        receivables = receivablesAfter;
        obligations = obligationsAfter;
        totalFeesAccrued += fee;

        Book storage b = books[dividendId];
        b.receivable += gross;
        b.obligation += net;
        b.fee += fee;
        b.grossBooked += gross;

        emit FeeAccrued(dividendId, fee);
        emit AdvancePaid(dividendId, user, gross, net, fee);
    }

    /// @inheritdoc IAdvanceVault
    function releaseAdvance(uint256 dividendId, address to, uint256 amount)
        external
        onlyRole(CORE_ROLE)
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        Book storage b = books[dividendId];
        if (amount > b.obligation) revert ObligationExceeded(amount, b.obligation);

        b.obligation -= amount;
        obligations -= amount;

        IERC20(asset()).safeTransfer(to, amount);
        emit AdvanceReleased(dividendId, to, amount);
    }

    /// @inheritdoc IAdvanceVault
    function repayAdvance(uint256 dividendId, uint256 amount) external onlyRole(CORE_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Book storage b = books[dividendId];
        if (amount > b.receivable) revert ReceivableExceeded(amount, b.receivable);

        b.receivable -= amount;
        receivables -= amount;

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit AdvanceRepaid(dividendId, amount);
    }

    /// @inheritdoc IAdvanceVault
    function recordLoss(uint256 dividendId, uint256 amount) external onlyRole(CORE_ROLE) {
        if (amount == 0) revert ZeroAmount();
        Book storage b = books[dividendId];
        if (amount > b.receivable) revert ReceivableExceeded(amount, b.receivable);

        b.receivable -= amount;
        receivables -= amount;
        totalLosses += amount;
        emit LossRecorded(dividendId, amount);
    }

    /// @inheritdoc IAdvanceVault
    function cancelObligation(uint256 dividendId, uint256 amount) external onlyRole(CORE_ROLE) {
        if (amount == 0) revert ZeroAmount();
        Book storage b = books[dividendId];
        if (amount > b.obligation) revert ObligationExceeded(amount, b.obligation);

        b.obligation -= amount;
        obligations -= amount;
    }

    /// @inheritdoc IAdvanceVault
    /// @dev DripCore transfers the seized tokens in the same transaction. This only books them.
    function receiveClawback(uint256 dividendId, address stockToken, uint256 amount) external onlyRole(CORE_ROLE) {
        seizedCollateral[stockToken] += amount;
        emit CollateralClawedBack(dividendId, stockToken, amount);
    }

    /// @notice Hand seized stock tokens to an admin controlled address for liquidation.
    /// @dev Deliberately manual in v1. Automating this means putting a DEX route on the
    ///      recovery path, which is a strictly worse thing to have to trust. See HANDOFF.md.
    function liquidateCollateral(address stockToken, address to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (to == address(0)) revert ZeroAddress();
        seizedCollateral[stockToken] -= amount;
        IERC20(stockToken).safeTransfer(to, amount);
        emit CollateralLiquidated(stockToken, to, amount);
    }

    // ---------------------------------------------------------------------
    // Views and admin
    // ---------------------------------------------------------------------

    /// @inheritdoc IAdvanceVault
    function receivableOf(uint256 dividendId) external view returns (uint256) {
        return books[dividendId].receivable;
    }

    /// @inheritdoc IAdvanceVault
    function obligationOf(uint256 dividendId) external view returns (uint256) {
        return books[dividendId].obligation;
    }

    /// @inheritdoc IAdvanceVault
    function utilizationBps() external view returns (uint256) {
        uint256 assets = totalAssets();
        if (assets == 0) return 0;
        return (receivables * BPS) / assets;
    }

    /// @notice Set the advance fee. Capped at 5 percent by MAX_FEE_BPS.
    function setAdvanceFeeBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh(bps);
        advanceFeeBps = bps;
        emit AdvanceFeeSet(bps);
    }

    /// @notice Set the utilisation cap. Hard capped below 100 percent.
    function setMaxUtilizationBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_UTILIZATION_CEILING_BPS) revert UtilizationTooHigh(bps);
        maxUtilizationBps = bps;
        emit MaxUtilizationSet(bps);
    }

    /// @notice Stop deposits, withdrawals and new advances. Existing claims keep working.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Resume.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
