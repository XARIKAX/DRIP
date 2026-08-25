// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IDripCore} from "./interfaces/IDripCore.sol";
import {IDividendRegistry} from "./interfaces/IDividendRegistry.sol";
import {IAdvanceVault} from "./interfaces/IAdvanceVault.sol";
import {IStreamEngine} from "./interfaces/IStreamEngine.sol";
import {IReinvestor} from "./interfaces/IReinvestor.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {Mode, Dividend, DividendStatus} from "./interfaces/DripTypes.sol";

/// @title DripCore
/// @notice Custody, eligibility, routing. Deposit a stock token here and its
///         dividends stop behaving like 1970s corporate plumbing.
/// @dev THE ELIGIBILITY DESIGN DECISION, stated once, loudly, because everything
///      else follows from it:
///
///        Only stock tokens deposited in DripCore before the ex date are eligible.
///
///      The protocol does not snapshot balances in external wallets. It does not
///      require the stock token to be an ERC20Snapshot, does not need hooks in the
///      token, and does not need a merkle drop from an offchain indexer. Eligibility
///      is proved from this contract's own checkpoint history, which is written on
///      every deposit, withdrawal and reinvestment.
///
///      What that buys: the protocol works with any plain ERC-20, including stock
///      tokens that already exist and will never be modified for us.
///      What it costs: holders must opt in by depositing. A holder who keeps the
///      token in their own wallet gets exactly what they get today.
///
///      That trade is the right way round. Every other design forces a change in a
///      token we do not control.
contract DripCore is IDripCore, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Checkpoints for Checkpoints.Trace208;

    /// @notice Settles dividends and runs clawback. Testnet: admin. Production: keeper bot.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @notice Held by Reinvestor. The only caller allowed to grow a position without a deposit.
    bytes32 public constant REINVESTOR_ROLE = keccak256("REINVESTOR_ROLE");

    /// @dev One whole stock token. Dividends are quoted per this.
    uint256 private constant ONE_STOCK = 1e18;

    /// @notice The calendar.
    IDividendRegistry public immutable registry;

    /// @notice The balance sheet that fronts the money.
    IAdvanceVault public immutable vault;

    /// @notice USDG. Every dividend is denominated in it.
    IERC20 public immutable usdg;

    /// @notice Turns entitlements into per second streams.
    IStreamEngine public streamEngine;

    /// @notice The DRIP module.
    IReinvestor public reinvestor;

    /// @notice Price source used only to size a clawback seizure.
    ISwapAdapter public swapAdapter;

    /// @dev user => stockToken => position.
    mapping(address => mapping(address => Position)) private _positions;

    /// @dev user => stockToken => balance history. This is the eligibility proof.
    mapping(address => mapping(address => Checkpoints.Trace208)) private _userHistory;

    /// @dev stockToken => protocol wide deposit history. Sizes the settlement payment.
    mapping(address => Checkpoints.Trace208) private _totalHistory;

    /// @dev dividendId => user => entitlement.
    mapping(uint256 => mapping(address => Entitlement)) private _entitlements;

    /// @notice USDG held for a settled dividend, waiting for holders who never activated.
    mapping(uint256 => uint256) public settledPool;

    /// @notice Set once a dividend has been funded through settleDividend.
    mapping(uint256 => bool) public funded;

    /// @dev user => stock tokens ever touched.
    mapping(address => address[]) private _userTokens;
    mapping(address => mapping(address => bool)) private _userHasToken;

    event StreamEngineSet(address indexed streamEngine);
    event ReinvestorSet(address indexed reinvestor);
    event SwapAdapterSet(address indexed adapter);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 have, uint256 want);
    error DividendNotDeclared(uint256 dividendId);
    error BeforeExDate(uint64 exDate);
    error AfterPayDate(uint64 payDate);
    error AlreadyActivated(uint256 dividendId, address user);
    error NothingEligible(uint256 dividendId, address user);
    error AlreadyFunded(uint256 dividendId);
    error NotSettled(uint256 dividendId);
    error NotVoided(uint256 dividendId);
    error AlreadyClaimed(uint256 dividendId, address user);
    error NotActivated(uint256 dividendId, address user);
    error AlreadyClawedBack(uint256 dividendId, address user);
    error ModulesNotWired();

    constructor(IDividendRegistry registry_, IAdvanceVault vault_, IERC20 usdg_, address admin) {
        if (
            address(registry_) == address(0) || address(vault_) == address(0) || address(usdg_) == address(0)
                || admin == address(0)
        ) revert ZeroAddress();
        registry = registry_;
        vault = vault_;
        usdg = usdg_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Wiring. Called once at deploy time.
    // ---------------------------------------------------------------------

    /// @notice Point at the stream engine.
    function setStreamEngine(IStreamEngine streamEngine_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(streamEngine_) == address(0)) revert ZeroAddress();
        streamEngine = streamEngine_;
        emit StreamEngineSet(address(streamEngine_));
    }

    /// @notice Point at the reinvest module.
    function setReinvestor(IReinvestor reinvestor_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(reinvestor_) == address(0)) revert ZeroAddress();
        reinvestor = reinvestor_;
        emit ReinvestorSet(address(reinvestor_));
    }

    /// @notice Point at the price source used to size clawback seizures.
    function setSwapAdapter(ISwapAdapter adapter_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(adapter_) == address(0)) revert ZeroAddress();
        swapAdapter = adapter_;
        emit SwapAdapterSet(address(adapter_));
    }

    // ---------------------------------------------------------------------
    // Custody
    // ---------------------------------------------------------------------

    /// @inheritdoc IDripCore
    function deposit(address stockToken, uint256 amount) external nonReentrant whenNotPaused {
        if (stockToken == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        IERC20(stockToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 newBalance = _credit(msg.sender, stockToken, amount);
        emit Deposited(msg.sender, stockToken, amount, newBalance);
    }

    /// @inheritdoc IDripCore
    /// @dev Withdrawing does not touch entitlements already created. It only shrinks
    ///      the balance that future ex dates will see.
    function withdraw(address stockToken, uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        Position storage p = _positions[msg.sender][stockToken];
        if (p.amount < amount) revert InsufficientBalance(p.amount, amount);

        uint256 newBalance = p.amount - amount;
        p.amount = newBalance;
        _writeCheckpoints(msg.sender, stockToken, newBalance, _totalDeposited(stockToken) - amount);

        IERC20(stockToken).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, stockToken, amount, newBalance);
    }

    /// @inheritdoc IDripCore
    function setMode(address stockToken, Mode mode) external whenNotPaused {
        Position storage p = _positions[msg.sender][stockToken];
        p.mode = mode;
        p.initialized = true;
        emit ModeSet(msg.sender, stockToken, mode);
    }

    /// @inheritdoc IDripCore
    /// @dev Deliberately not nonReentrant. It is reached from inside claimSettled, which
    ///      already holds this contract's guard, so a guard here would deadlock the
    ///      settled reinvest path. Safety comes from elsewhere and is tighter: the caller
    ///      must hold REINVESTOR_ROLE, that role is held only by Reinvestor, and
    ///      Reinvestor.reinvest is itself nonReentrant. A hostile stock token calling
    ///      back in would arrive as Reinvestor and be stopped by Reinvestor's own guard.
    function creditReinvest(address user, address stockToken, uint256 amount) external onlyRole(REINVESTOR_ROLE) {
        if (amount == 0) revert ZeroAmount();
        IERC20(stockToken).safeTransferFrom(msg.sender, address(this), amount);
        uint256 newBalance = _credit(user, stockToken, amount);
        emit Reinvested(user, stockToken, amount, newBalance);
    }

    // ---------------------------------------------------------------------
    // Entitlements
    // ---------------------------------------------------------------------

    /// @inheritdoc IDripCore
    function activate(uint256 dividendId, address user)
        public
        nonReentrant
        whenNotPaused
        returns (uint256 net, uint256 streamId)
    {
        return _activate(dividendId, user);
    }

    /// @inheritdoc IDripCore
    /// @dev Skips holders who cannot be activated instead of reverting, so one bad
    ///      address does not kill a keeper batch.
    function activateBatch(uint256 dividendId, address[] calldata users) external nonReentrant whenNotPaused {
        uint256 n = users.length;
        for (uint256 i = 0; i < n; ++i) {
            address user = users[i];
            if (_entitlements[dividendId][user].activated) continue;
            if (pendingEntitlement(dividendId, user) == 0) continue;
            _activate(dividendId, user);
        }
    }

    /// @inheritdoc IDripCore
    function pendingEntitlement(uint256 dividendId, address user) public view returns (uint256) {
        Entitlement storage e = _entitlements[dividendId][user];
        if (e.activated || e.claimed) return 0;
        Dividend memory d = registry.getDividend(dividendId);
        if (d.status == DividendStatus.NONE || d.status == DividendStatus.VOIDED) return 0;
        uint256 bal = balanceOfAt(user, d.stockToken, d.exDate);
        return (bal * d.amountPerToken) / ONE_STOCK;
    }

    /// @notice What a dividend costs the issuer in total, using the ex date snapshot.
    function totalEntitlementFor(uint256 dividendId) public view returns (uint256) {
        Dividend memory d = registry.getDividend(dividendId);
        if (d.status == DividendStatus.NONE) return 0;
        return (totalDepositedAt(d.stockToken, d.exDate) * d.amountPerToken) / ONE_STOCK;
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// @inheritdoc IDripCore
    /// @dev The caller pays the full ex date eligible amount. The vault is repaid
    ///      exactly what it fronted; whatever is left is parked for holders who never
    ///      activated and can be claimed with no fee. Testnet: an admin is the payer.
    ///      Production: this is where the issuer's settlement leg lands.
    function settleDividend(uint256 dividendId) external onlyRole(KEEPER_ROLE) nonReentrant {
        if (funded[dividendId]) revert AlreadyFunded(dividendId);
        Dividend memory d = registry.getDividend(dividendId);
        if (d.status != DividendStatus.DECLARED) revert DividendNotDeclared(dividendId);

        uint256 totalOwed = totalEntitlementFor(dividendId);
        funded[dividendId] = true;

        usdg.safeTransferFrom(msg.sender, address(this), totalOwed);

        uint256 owedToVault = vault.receivableOf(dividendId);
        if (owedToVault > 0) {
            usdg.forceApprove(address(vault), owedToVault);
            vault.repayAdvance(dividendId, owedToVault);
            usdg.forceApprove(address(vault), 0);
        }

        settledPool[dividendId] = totalOwed - owedToVault;
        registry.settleDividend(dividendId, totalOwed);
        emit SettledDividendFunded(dividendId, totalOwed, owedToVault);
    }

    /// @inheritdoc IDripCore
    /// @dev The slow lane. No advance, no fee, paid at the pay date, exactly like the
    ///      system this protocol replaces. It exists so opting out is never a trap.
    function claimSettled(uint256 dividendId) external nonReentrant whenNotPaused returns (uint256 amount) {
        Dividend memory d = registry.getDividend(dividendId);
        if (d.status != DividendStatus.SETTLED) revert NotSettled(dividendId);

        Entitlement storage e = _entitlements[dividendId][msg.sender];
        if (e.activated) revert AlreadyActivated(dividendId, msg.sender);
        if (e.claimed) revert AlreadyClaimed(dividendId, msg.sender);

        amount = (balanceOfAt(msg.sender, d.stockToken, d.exDate) * d.amountPerToken) / ONE_STOCK;
        if (amount == 0) revert NothingEligible(dividendId, msg.sender);

        e.claimed = true;
        e.gross = amount;
        e.net = amount;
        e.mode = _positions[msg.sender][d.stockToken].mode;
        settledPool[dividendId] -= amount;

        if (e.mode == Mode.REINVEST && address(reinvestor) != address(0)) {
            usdg.safeTransfer(address(reinvestor), amount);
            reinvestor.reinvest(msg.sender, d.stockToken, amount);
        } else {
            usdg.safeTransfer(msg.sender, amount);
        }

        emit SettledEntitlementClaimed(msg.sender, dividendId, amount);
    }

    // ---------------------------------------------------------------------
    // Void and clawback
    // ---------------------------------------------------------------------

    /// @inheritdoc IDripCore
    /// @dev SIMPLIFIED FOR TESTNET. Production hardening is specified in HANDOFF.md.
    ///      What it does: kills the stream, cancels the undrawn obligation so the vault
    ///      stops owing money that will never arrive, seizes stock tokens from the
    ///      holder's position worth the cash actually paid out, hands them to the vault,
    ///      and writes off the receivable. LPs keep the collateral as recovery.
    ///      What it does not do: chase a holder who withdrew their collateral before the
    ///      void landed. That is the residual risk, and it is bounded by the utilisation
    ///      cap plus the fact that a void is an issuer level event, not a user action.
    function clawback(uint256 dividendId, address user) external onlyRole(KEEPER_ROLE) nonReentrant {
        Dividend memory d = registry.getDividend(dividendId);
        if (d.status != DividendStatus.VOIDED) revert NotVoided(dividendId);

        Entitlement storage e = _entitlements[dividendId][user];
        if (!e.activated) revert NotActivated(dividendId, user);
        if (e.clawedBack) revert AlreadyClawedBack(dividendId, user);
        e.clawedBack = true;

        // 1. Stop the bleeding: cancel whatever the holder has not drawn yet.
        uint256 undrawn;
        if (e.streamId != 0) {
            undrawn = streamEngine.cancelStream(e.streamId);
            if (undrawn > 0) vault.cancelObligation(dividendId, undrawn);
        }

        // 2. Size the hole: cash that actually left the vault for this holder.
        uint256 cashOut = e.net - undrawn;

        // 3. Seize collateral worth that cash, capped by what the holder still has.
        uint256 seized;
        if (cashOut > 0 && address(swapAdapter) != address(0)) {
            uint256 needed = swapAdapter.quote(address(usdg), d.stockToken, cashOut);
            Position storage p = _positions[user][d.stockToken];
            seized = needed > p.amount ? p.amount : needed;
            if (seized > 0) {
                uint256 newBalance = p.amount - seized;
                p.amount = newBalance;
                _writeCheckpoints(user, d.stockToken, newBalance, _totalDeposited(d.stockToken) - seized);
                IERC20(d.stockToken).safeTransfer(address(vault), seized);
                vault.receiveClawback(dividendId, d.stockToken, seized);
            }
        }

        // 4. Write off the receivable. The seized stock is the recovery, not a repayment.
        uint256 receivable = vault.receivableOf(dividendId);
        uint256 writeOff = e.gross > receivable ? receivable : e.gross;
        if (writeOff > 0) vault.recordLoss(dividendId, writeOff);

        emit ClawedBack(user, dividendId, seized, cashOut);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc IDripCore
    function balanceOf(address user, address stockToken) external view returns (uint256) {
        return _positions[user][stockToken].amount;
    }

    /// @inheritdoc IDripCore
    function balanceOfAt(address user, address stockToken, uint64 timestamp) public view returns (uint256) {
        return _userHistory[user][stockToken].upperLookupRecent(SafeCast.toUint48(timestamp));
    }

    /// @inheritdoc IDripCore
    function totalDepositedAt(address stockToken, uint64 timestamp) public view returns (uint256) {
        return _totalHistory[stockToken].upperLookupRecent(SafeCast.toUint48(timestamp));
    }

    /// @inheritdoc IDripCore
    function totalDeposited(address stockToken) external view returns (uint256) {
        return _totalDeposited(stockToken);
    }

    /// @inheritdoc IDripCore
    function positionOf(address user, address stockToken) external view returns (Position memory) {
        return _positions[user][stockToken];
    }

    /// @inheritdoc IDripCore
    function entitlementOf(uint256 dividendId, address user) external view returns (Entitlement memory) {
        return _entitlements[dividendId][user];
    }

    /// @inheritdoc IDripCore
    function tokensOf(address user) external view returns (address[] memory) {
        return _userTokens[user];
    }

    /// @notice Stop deposits, withdrawals, activations and settled claims.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Resume.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Grow a position and write both checkpoints. Used by deposit and reinvest.
    function _credit(address user, address stockToken, uint256 amount) private returns (uint256 newBalance) {
        Position storage p = _positions[user][stockToken];

        if (!p.initialized) {
            // Never leave a default to be inferred from an enum's zero value. Streaming
            // is the product, so streaming is what a new position does, written explicitly.
            p.initialized = true;
            p.mode = Mode.STREAM;
            emit ModeSet(user, stockToken, Mode.STREAM);
        }
        if (!_userHasToken[user][stockToken]) {
            _userHasToken[user][stockToken] = true;
            _userTokens[user].push(stockToken);
        }

        newBalance = p.amount + amount;
        p.amount = newBalance;
        _writeCheckpoints(user, stockToken, newBalance, _totalDeposited(stockToken) + amount);
    }

    /// @dev One checkpoint write for the holder, one for the protocol total.
    function _writeCheckpoints(address user, address stockToken, uint256 userBalance, uint256 totalBalance) private {
        uint48 key = SafeCast.toUint48(block.timestamp);
        _userHistory[user][stockToken].push(key, SafeCast.toUint208(userBalance));
        _totalHistory[stockToken].push(key, SafeCast.toUint208(totalBalance));
    }

    /// @dev Latest checkpointed protocol wide balance for a token.
    function _totalDeposited(address stockToken) private view returns (uint256) {
        return _totalHistory[stockToken].latest();
    }

    /// @dev The routing decision. One dividend, one holder, one of three outcomes.
    function _activate(uint256 dividendId, address user) private returns (uint256 net, uint256 streamId) {
        if (address(streamEngine) == address(0)) revert ModulesNotWired();

        Dividend memory d = registry.getDividend(dividendId);
        if (d.status != DividendStatus.DECLARED) revert DividendNotDeclared(dividendId);
        if (block.timestamp < d.exDate) revert BeforeExDate(d.exDate);
        if (block.timestamp >= d.payDate) revert AfterPayDate(d.payDate);

        Entitlement storage e = _entitlements[dividendId][user];
        if (e.activated) revert AlreadyActivated(dividendId, user);
        if (e.claimed) revert AlreadyClaimed(dividendId, user);

        uint256 gross = (balanceOfAt(user, d.stockToken, d.exDate) * d.amountPerToken) / ONE_STOCK;
        if (gross == 0) revert NothingEligible(dividendId, user);

        Mode mode = _positions[user][d.stockToken].mode;

        e.gross = gross;
        e.mode = mode;
        e.activated = true;
        emit EntitlementCreated(user, d.stockToken, dividendId, gross, mode);

        // The vault books the whole gross as a receivable and the net as an obligation.
        // The fee is recognised right here, at the moment the risk is taken.
        net = vault.bookAdvance(dividendId, user, gross);
        e.net = net;

        if (mode == Mode.CASH_EARLY) {
            // Weeks early, in one payment, at the ex date.
            vault.releaseAdvance(dividendId, user, net);
        } else {
            // Per second from the ex date to the pay date. REINVEST routes each claim
            // through the swap on the way out.
            streamId = streamEngine.startStream(user, dividendId, d.stockToken, net, d.exDate, d.payDate, mode);
            e.streamId = streamId;
        }

        emit EntitlementActivated(user, dividendId, mode, net, streamId);
    }
}
