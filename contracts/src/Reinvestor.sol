// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IReinvestor} from "./interfaces/IReinvestor.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {IDripCore} from "./interfaces/IDripCore.sol";

/// @title Reinvestor
/// @notice The DRIP module. The moment a dividend lands it becomes more stock.
/// @dev Robinhood's own support page states the terms of its DRIP: reinvestment
///      happens on the trading day after the pay date, only during market hours,
///      subject to a midnight cutoff, and the resulting fractional share cannot
///      leave the app. This contract does the same job in the same transaction the
///      dividend accrues, at any hour, into a token the holder custodies.
///
///      The swap venue is behind ISwapAdapter. Testnet uses a fixed price mock.
///      Production points at the chain's Uniswap deployment. Nothing else moves.
contract Reinvestor is IReinvestor, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Held by StreamEngine and DripCore. The only callers allowed to spend claimed USDG.
    bytes32 public constant CORE_ROLE = keccak256("CORE_ROLE");

    /// @dev Basis point denominator.
    uint256 private constant BPS = 10_000;

    /// @notice Ceiling on a holder's slippage tolerance. 10 percent. Above this it is not a swap, it is a donation.
    uint256 public constant MAX_SLIPPAGE_CEILING_BPS = 1_000;

    /// @notice Slippage applied when a holder never picked one. 1 percent.
    uint256 public constant DEFAULT_SLIPPAGE_BPS = 100;

    /// @notice USDG. What gets sold.
    IERC20 public immutable usdg;

    /// @notice Custody. Reinvested tokens are credited straight back into the position.
    IDripCore public immutable core;

    /// @notice The swap venue.
    ISwapAdapter public swapAdapter;

    /// @dev user => slippage bps. Zero means never set, so DEFAULT_SLIPPAGE_BPS applies.
    mapping(address => uint256) private _slippageBps;

    /// @notice Lifetime USDG reinvested per stock token. Powers the compounding stat on the dashboard.
    mapping(address => uint256) public totalReinvestedUsdg;

    /// @notice Lifetime stock tokens bought per stock token.
    mapping(address => uint256) public totalTokensBought;

    error SlippageTooHigh(uint256 bps);
    error ZeroAddress();
    error ZeroAmount();
    error NoAdapter();

    constructor(IERC20 usdg_, IDripCore core_, ISwapAdapter adapter_, address admin) {
        if (address(usdg_) == address(0) || address(core_) == address(0) || admin == address(0)) revert ZeroAddress();
        usdg = usdg_;
        core = core_;
        swapAdapter = adapter_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        emit SwapAdapterSet(address(adapter_));
    }

    /// @notice Repoint the swap venue. This is the mock to Uniswap switch at launch.
    function setSwapAdapter(ISwapAdapter adapter_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(adapter_) == address(0)) revert ZeroAddress();
        swapAdapter = adapter_;
        emit SwapAdapterSet(address(adapter_));
    }

    /// @inheritdoc IReinvestor
    function setMaxSlippage(uint256 maxSlippageBps_) external {
        if (maxSlippageBps_ == 0 || maxSlippageBps_ > MAX_SLIPPAGE_CEILING_BPS) revert SlippageTooHigh(maxSlippageBps_);
        _slippageBps[msg.sender] = maxSlippageBps_;
        emit SlippageSet(msg.sender, maxSlippageBps_);
    }

    /// @inheritdoc IReinvestor
    function maxSlippageBps(address user) public view returns (uint256) {
        uint256 s = _slippageBps[user];
        return s == 0 ? DEFAULT_SLIPPAGE_BPS : s;
    }

    /// @inheritdoc IReinvestor
    /// @dev The caller must have already moved `usdgAmount` of USDG to this contract.
    ///      That is how StreamEngine hands over a claim without the money ever touching
    ///      the holder's wallet.
    function reinvest(address user, address stockToken, uint256 usdgAmount)
        external
        onlyRole(CORE_ROLE)
        nonReentrant
        whenNotPaused
        returns (uint256 tokensOut)
    {
        if (usdgAmount == 0) revert ZeroAmount();
        ISwapAdapter adapter = swapAdapter;
        if (address(adapter) == address(0)) revert NoAdapter();

        uint256 expected = adapter.quote(address(usdg), stockToken, usdgAmount);
        uint256 minOut = (expected * (BPS - maxSlippageBps(user))) / BPS;

        usdg.forceApprove(address(adapter), usdgAmount);
        tokensOut = adapter.swap(address(usdg), stockToken, usdgAmount, minOut, address(this));
        usdg.forceApprove(address(adapter), 0);

        totalReinvestedUsdg[stockToken] += usdgAmount;
        totalTokensBought[stockToken] += tokensOut;

        // Close the loop: the bought stock goes straight back into the position that
        // earned it, so the next dividend is calculated on a bigger balance.
        IERC20(stockToken).forceApprove(address(core), tokensOut);
        core.creditReinvest(user, stockToken, tokensOut);

        emit Reinvested(user, stockToken, usdgAmount, tokensOut);
    }

    /// @notice Halt reinvestment. STREAM claims are unaffected.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Resume.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Sweep a token stuck here by a failed integration. Never touches user positions.
    /// @dev Reinvestor holds no balances between transactions by design, so anything
    ///      sitting here is dust or an accident.
    function sweep(address token, address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
