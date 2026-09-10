// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISplitVault} from "./interfaces/ISplitVault.sol";

/// @title YieldMarket
/// @notice Buys Yield Tokens for USDG, so a holder can take their dividend today
///         instead of waiting for the multiplier to earn it.
/// @dev This is "get paid early" rebuilt for an asset that accretes rather than one
///      that pays cash. The old advance fronted USDG against a declared dividend and
///      collected from the issuer on the pay date — a receivable that only ever
///      existed because somebody promised to fund it. Here there is no promise and no
///      issuer: the buyer takes the YT, holds it to maturity, and collects the
///      accretion the asset produces on its own.
///
///      THE PRICE IS SET, NOT DISCOVERED, and that is the honest description. Pricing
///      a YT properly means forecasting a dividend stream, and no oracle on this chain
///      publishes one. So the admin posts a bid per series and wears the risk of
///      posting it wrong. Two guards make wrong survivable rather than ruinous:
///
///        `budget`  caps total USDG this series can spend, so a stale bid drains a
///                  line item and not the treasury.
///        `bid`     is zero by default. A series nobody has priced does not trade.
///
///      Anyone can sell into the bid. Nobody has to. A holder who thinks the bid is
///      low keeps their YT and collects the real accretion at maturity, which is the
///      whole point of the thing being a token.
contract YieldMarket is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PRICER_ROLE = keccak256("PRICER_ROLE");

    uint256 private constant ONE = 1e18;

    ISplitVault public immutable splitVault;
    IERC20 public immutable usdg;

    /// @notice USDG (6dp) offered for one whole YT (1e18), per series. Zero means closed.
    mapping(uint256 => uint256) public bid;
    /// @notice USDG this series may still spend. Falls as it buys.
    mapping(uint256 => uint256) public budget;
    /// @notice YT bought and held, per series.
    mapping(uint256 => uint256) public held;
    /// @notice USDG spent, per series. Never decreases; a record, not a balance.
    mapping(uint256 => uint256) public spent;

    event BidSet(uint256 indexed seriesId, uint256 usdgPerYt, uint256 budget);
    event Bought(uint256 indexed seriesId, address indexed seller, uint256 ytIn, uint256 usdgOut);
    event Harvested(uint256 indexed seriesId, uint256 rawOut);
    event Funded(address indexed from, uint256 amount);
    event Swept(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error MarketClosed(uint256 seriesId);
    error OverBudget(uint256 seriesId, uint256 wanted, uint256 remaining);
    error InsufficientCash(uint256 wanted, uint256 held);
    error PriceTooHigh(uint256 usdgPerYt, uint256 max);

    /// @dev A YT is a claim on the growth of one stock token over one series. Paying
    ///      more than a whole token is worth for it is never right, and the cap is
    ///      deliberately crude because it is a backstop against a fat finger, not a
    ///      valuation. One USDG per YT is already far above any plausible bid.
    uint256 public constant MAX_BID_USDG_PER_YT = 1e6;

    constructor(ISplitVault splitVault_, IERC20 usdg_, address admin) {
        if (address(splitVault_) == address(0) || address(usdg_) == address(0) || admin == address(0)) {
            revert ZeroAddress();
        }
        splitVault = splitVault_;
        usdg = usdg_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PRICER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Pricing
    // ---------------------------------------------------------------------

    /// @notice Post a bid for a series, and the most USDG it may spend at that bid.
    /// @dev Setting the bid to zero closes the series without disturbing the budget,
    ///      which is what you want when a price looks wrong and you need it to stop
    ///      trading before you have decided the new one.
    function setBid(uint256 seriesId, uint256 usdgPerYt, uint256 budget_) external onlyRole(PRICER_ROLE) {
        if (usdgPerYt > MAX_BID_USDG_PER_YT) revert PriceTooHigh(usdgPerYt, MAX_BID_USDG_PER_YT);
        bid[seriesId] = usdgPerYt;
        budget[seriesId] = budget_;
        emit BidSet(seriesId, usdgPerYt, budget_);
    }

    /// @notice USDG a seller would receive for `ytAmount` right now.
    function quote(uint256 seriesId, uint256 ytAmount) public view returns (uint256) {
        return (ytAmount * bid[seriesId]) / ONE;
    }

    // ---------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------

    /// @notice Sell YT for USDG at the posted bid.
    /// @dev `minUsdgOut` is the seller's protection against the bid moving between
    ///      building the transaction and mining it. Without it a repricing in the same
    ///      block would fill them at a number they never agreed to.
    function sell(uint256 seriesId, uint256 ytAmount, uint256 minUsdgOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 usdgOut)
    {
        if (ytAmount == 0) revert ZeroAmount();
        uint256 price = bid[seriesId];
        if (price == 0) revert MarketClosed(seriesId);

        usdgOut = (ytAmount * price) / ONE;
        if (usdgOut == 0) revert ZeroAmount();
        if (usdgOut < minUsdgOut) revert InsufficientCash(minUsdgOut, usdgOut);

        uint256 remaining = budget[seriesId];
        if (usdgOut > remaining) revert OverBudget(seriesId, usdgOut, remaining);

        uint256 cash = usdg.balanceOf(address(this));
        if (usdgOut > cash) revert InsufficientCash(usdgOut, cash);

        budget[seriesId] = remaining - usdgOut;
        held[seriesId] += ytAmount;
        spent[seriesId] += usdgOut;

        (, , , address yieldToken, ) = splitVault.series(seriesId);
        IERC20(yieldToken).safeTransferFrom(msg.sender, address(this), ytAmount);
        usdg.safeTransfer(msg.sender, usdgOut);

        emit Bought(seriesId, msg.sender, ytAmount, usdgOut);
    }

    /// @notice Collect what the YT this market holds has accrued. Permissionless.
    /// @dev Pays out in the stock token, like every other yield claim. The stock lands
    ///      here and an admin sweeps it; converting to USDG would need a swap and a
    ///      slippage policy this contract has no business owning.
    function harvest(uint256 seriesId) external nonReentrant returns (uint256 rawOut) {
        rawOut = splitVault.claimYield(seriesId);
        emit Harvested(seriesId, rawOut);
    }

    // ---------------------------------------------------------------------
    // Treasury
    // ---------------------------------------------------------------------

    /// @notice Put USDG in. Anyone may; only the admin takes anything out.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Withdraw USDG or harvested stock.
    function sweep(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    function pause() external onlyRole(PRICER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
