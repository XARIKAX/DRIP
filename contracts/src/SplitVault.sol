// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISplitVault} from "./interfaces/ISplitVault.sol";
import {IDripCore} from "./interfaces/IDripCore.sol";
import {IDividendRegistry} from "./interfaces/IDividendRegistry.sol";
import {Mode, Dividend} from "./interfaces/DripTypes.sol";
import {PrincipalToken} from "./PrincipalToken.sol";
import {YieldToken} from "./YieldToken.sol";

/// @title SplitVault
/// @notice Splits a stock token into a Principal Token and a Yield Token — the
///         product's Pendle-shaped module, and the only one that wraps the share.
/// @dev THE ACCOUNTING IDENTITY, stated once, loudly, the same way every other
///      contract in this protocol states its own:
///
///        dripCore.balanceOf(this, stockToken) == the active series' PT.totalSupply()
///
///      That holds because of the one rule this contract enforces everywhere else
///      gets to ignore: only one series may be active per stock token, and a new
///      one cannot open until the prior series' PT supply is fully redeemed to
///      zero. With that invariant, this contract's entire DripCore position for a
///      stock token is always exactly one series' backing — no cross-series
///      proration is needed anywhere below, because there is never more than one
///      series to prorate between.
///
///      SplitVault deposits into DripCore under its own address, in CASH_EARLY
///      mode, and becomes an ordinary DripCore holder like anyone else. When a
///      dividend is harvested, DripCore pays SplitVault the same way it pays any
///      CASH_EARLY holder — immediately, at the ex date, minus AdvanceVault's fee
///      — and that USDG becomes the pot YT holders draw from, pro rata to the YT
///      balance they held at that dividend's own ex date, proven from YieldToken's
///      own checkpoint history exactly the way DripCore proves stock eligibility
///      from its own.
contract SplitVault is ISplitVault, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Opens series and may pause. Testnet: admin. Production: a keeper.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 private constant BPS = 10_000;

    /// @dev Ceiling on the split fee. One percent, matching the advance fee's ceiling
    ///      in AdvanceVault — an admin cannot quietly confiscate more of a split than
    ///      that, whatever the fee is set to.
    uint256 public constant MAX_SPLIT_FEE_BPS = 100;

    IDripCore public immutable dripCore;
    IDividendRegistry public immutable registry;
    IERC20 public immutable usdg;

    /// @notice Fee taken from stock deposited on split. Ten basis points by default,
    ///         the same figure a Pendle-shaped competitor quotes for the same action.
    uint256 public splitFeeBps = 10;

    uint256 public seriesCount;
    mapping(uint256 => Series) public series;

    /// @dev stockToken => the one series currently open for it, or 0 for none.
    mapping(address => uint256) public activeSeriesOf;

    /// @dev seriesId => dividendId => net USDG this series received on harvest.
    mapping(uint256 => mapping(uint256 => uint256)) public dividendPool;

    /// @dev seriesId => dividendId => YT total supply at that dividend's ex date,
    ///      frozen at harvest time so later transfers cannot change the denominator.
    mapping(uint256 => mapping(uint256 => uint256)) public dividendYtSupplyAtHarvest;

    mapping(uint256 => mapping(uint256 => bool)) public harvested;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public yieldClaimed;

    /// @dev Split fee stock, held here rather than deposited, so PT.totalSupply()
    ///      never has to account for a fee that never entered DripCore.
    mapping(address => uint256) public feesOwed;

    error ZeroAddress();
    error ZeroAmount();
    error FeeTooHigh(uint256 bps, uint256 max);
    error SeriesNotFound(uint256 seriesId);
    error MaturityInPast(uint64 maturity);
    error SeriesStillActive(uint256 priorSeriesId, address stockToken);
    error NotMatured(uint256 seriesId, uint64 maturity);
    error AlreadyMatured(uint256 seriesId, uint64 maturity);
    error AlreadyHarvested(uint256 seriesId, uint256 dividendId);
    error NotHarvested(uint256 seriesId, uint256 dividendId);
    error AlreadyClaimed(uint256 seriesId, uint256 dividendId, address user);
    error NothingToClaim();
    error WrongStockForDividend(uint256 dividendId, address expected, address actual);

    constructor(IDripCore dripCore_, IDividendRegistry registry_, IERC20 usdg_, address admin) {
        if (address(dripCore_) == address(0) || address(registry_) == address(0) || address(usdg_) == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        dripCore = dripCore_;
        registry = registry_;
        usdg = usdg_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Series lifecycle
    // ---------------------------------------------------------------------

    /// @inheritdoc ISplitVault
    function createSeries(address stockToken, uint64 maturity) external onlyRole(KEEPER_ROLE) returns (uint256 seriesId) {
        if (stockToken == address(0)) revert ZeroAddress();
        if (maturity <= block.timestamp) revert MaturityInPast(maturity);

        uint256 prior = activeSeriesOf[stockToken];
        if (prior != 0) {
            PrincipalToken priorPt = PrincipalToken(series[prior].principalToken);
            if (priorPt.totalSupply() != 0) revert SeriesStillActive(prior, stockToken);
        }

        seriesId = ++seriesCount;

        // Symbol suffix is the series id, not the maturity date: cheap, unique, and
        // exactly enough for a testnet where a human reads the dashboard, not the
        // token symbol, to know when a series matures.
        string memory suffix = _toString(seriesId);
        PrincipalToken pt = new PrincipalToken(
            string.concat("Osinko Principal ", suffix), string.concat("p", suffix)
        );
        YieldToken yt = new YieldToken(string.concat("Osinko Yield ", suffix), string.concat("y", suffix));

        series[seriesId] = Series({
            stockToken: stockToken,
            maturity: maturity,
            principalToken: address(pt),
            yieldToken: address(yt),
            exists: true
        });
        activeSeriesOf[stockToken] = seriesId;

        // First deposit into a stock token defaults DripCore's mode to STREAM; the
        // vault needs CASH_EARLY so a harvest pays immediately instead of opening a
        // per-second stream this contract has no holder-list to redistribute through.
        dripCore.setMode(stockToken, Mode.CASH_EARLY);

        emit SeriesCreated(seriesId, stockToken, maturity, address(pt), address(yt));
    }

    // ---------------------------------------------------------------------
    // Split / merge / redeem
    // ---------------------------------------------------------------------

    /// @inheritdoc ISplitVault
    function split(uint256 seriesId, uint256 amount) external nonReentrant whenNotPaused returns (uint256 minted) {
        Series memory s = _series(seriesId);
        if (amount == 0) revert ZeroAmount();
        // Splitting past maturity would mint a Yield Token with nothing left to
        // accrue — the series is done, only redeemPrincipal (or a leftover merge)
        // makes sense here.
        if (block.timestamp >= s.maturity) revert AlreadyMatured(seriesId, s.maturity);

        uint256 fee = (amount * splitFeeBps) / BPS;
        minted = amount - fee;
        feesOwed[s.stockToken] += fee;

        IERC20(s.stockToken).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(s.stockToken).forceApprove(address(dripCore), minted);
        dripCore.deposit(s.stockToken, minted);

        PrincipalToken(s.principalToken).mint(msg.sender, minted);
        YieldToken(s.yieldToken).mint(msg.sender, minted);

        emit Split(seriesId, msg.sender, amount, minted, fee);
    }

    /// @inheritdoc ISplitVault
    function merge(uint256 seriesId, uint256 amount) external nonReentrant whenNotPaused {
        Series memory s = _series(seriesId);
        if (amount == 0) revert ZeroAmount();

        PrincipalToken(s.principalToken).burn(msg.sender, amount);
        YieldToken(s.yieldToken).burn(msg.sender, amount);

        dripCore.withdraw(s.stockToken, amount);
        IERC20(s.stockToken).safeTransfer(msg.sender, amount);

        emit Merged(seriesId, msg.sender, amount);
    }

    /// @inheritdoc ISplitVault
    function redeemPrincipal(uint256 seriesId, uint256 amount) external nonReentrant whenNotPaused {
        Series memory s = _series(seriesId);
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp < s.maturity) revert NotMatured(seriesId, s.maturity);

        PrincipalToken(s.principalToken).burn(msg.sender, amount);

        dripCore.withdraw(s.stockToken, amount);
        IERC20(s.stockToken).safeTransfer(msg.sender, amount);

        emit PrincipalRedeemed(seriesId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Yield harvest and claim
    // ---------------------------------------------------------------------

    /// @inheritdoc ISplitVault
    /// @dev Permissionless, same as DripCore.activate — a keeper, a YT holder or the
    ///      UI can all trigger it, and the USDG can only ever land in this contract,
    ///      to be drawn down by claimYield afterward.
    function harvestDividend(uint256 seriesId, uint256 dividendId) external nonReentrant returns (uint256 net) {
        Series memory s = _series(seriesId);
        if (harvested[seriesId][dividendId]) revert AlreadyHarvested(seriesId, dividendId);

        Dividend memory d = registry.getDividend(dividendId);
        if (d.stockToken != s.stockToken) revert WrongStockForDividend(dividendId, s.stockToken, d.stockToken);

        harvested[seriesId][dividendId] = true;

        uint256 before = usdg.balanceOf(address(this));
        (net,) = dripCore.activate(dividendId, address(this));
        // activate() pays CASH_EARLY entitlements straight to the address passed as
        // the holder, so the pot is just how much arrived, not the `net` return value
        // alone — belt and braces against any future accounting path that pays partial.
        net = usdg.balanceOf(address(this)) - before;

        uint256 ytSupply = YieldToken(s.yieldToken).totalSupplyAt(d.exDate);
        dividendPool[seriesId][dividendId] = net;
        dividendYtSupplyAtHarvest[seriesId][dividendId] = ytSupply;

        emit DividendHarvested(seriesId, dividendId, net, ytSupply);
    }

    /// @inheritdoc ISplitVault
    function claimYield(uint256 seriesId, uint256 dividendId) external nonReentrant returns (uint256 amount) {
        amount = pendingYield(seriesId, dividendId, msg.sender);
        if (amount == 0) revert NothingToClaim();

        yieldClaimed[seriesId][dividendId][msg.sender] = true;
        usdg.safeTransfer(msg.sender, amount);

        emit YieldClaimed(seriesId, dividendId, msg.sender, amount);
    }

    /// @inheritdoc ISplitVault
    function pendingYield(uint256 seriesId, uint256 dividendId, address user) public view returns (uint256) {
        if (!harvested[seriesId][dividendId]) return 0;
        if (yieldClaimed[seriesId][dividendId][user]) return 0;

        uint256 ytSupply = dividendYtSupplyAtHarvest[seriesId][dividendId];
        if (ytSupply == 0) return 0;

        Series storage s = series[seriesId];
        Dividend memory d = registry.getDividend(dividendId);
        uint256 bal = YieldToken(s.yieldToken).balanceOfAt(user, d.exDate);
        if (bal == 0) return 0;

        return (dividendPool[seriesId][dividendId] * bal) / ytSupply;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @inheritdoc ISplitVault
    function setSplitFeeBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_SPLIT_FEE_BPS) revert FeeTooHigh(bps, MAX_SPLIT_FEE_BPS);
        splitFeeBps = bps;
        emit SplitFeeSet(bps);
    }

    /// @notice Sweep accrued split fees. Callable by DEFAULT_ADMIN_ROLE.
    function withdrawFees(address stockToken, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        feesOwed[stockToken] -= amount;
        IERC20(stockToken).safeTransfer(to, amount);
    }

    function pause() external onlyRole(KEEPER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(KEEPER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _series(uint256 seriesId) private view returns (Series memory s) {
        s = series[seriesId];
        if (!s.exists) revert SeriesNotFound(seriesId);
    }

    /// @dev Minimal uint-to-string. Series ids are small; no library earns its weight here.
    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
