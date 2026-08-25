// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IStreamEngine} from "./interfaces/IStreamEngine.sol";
import {IAdvanceVault} from "./interfaces/IAdvanceVault.sol";
import {IReinvestor} from "./interfaces/IReinvestor.sol";
import {Mode} from "./interfaces/DripTypes.sol";

/// @title StreamEngine
/// @notice A dividend does not arrive. It accrues, per second, from the ex date to
///         the pay date.
/// @dev Lazy accounting. There is no per block push, no keeper requirement, no
///      cron. A stream is four numbers and claimable() is arithmetic:
///
///          accrued  = total * (min(now, end) - start) / (end - start)
///          claimable = accrued - claimed
///
///      Opening a stream costs one struct write. Claiming costs one update and one
///      transfer. The frontend polls claimable() and interpolates between polls,
///      which is why the counter on the dashboard ticks smoothly without spending gas.
///
///      Cash comes from AdvanceVault. The whole net entitlement was booked as an
///      obligation when the stream opened, so a claim can never fail for lack of
///      funds and the vault can never lend out money a streamer is owed.
contract StreamEngine is IStreamEngine, AccessControl, Pausable, ReentrancyGuard {

    /// @notice Held by DripCore. Opens and cancels streams.
    bytes32 public constant CORE_ROLE = keccak256("CORE_ROLE");

    /// @notice Held by batch claim bots. Can claim on a holder's behalf, never to itself.
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @notice The vault that funds every stream.
    IAdvanceVault public immutable vault;

    /// @notice USDG. What streams pay in.
    IERC20 public immutable usdg;

    /// @notice The DRIP module. Receives claims for REINVEST streams.
    IReinvestor public reinvestor;

    /// @inheritdoc IStreamEngine
    uint256 public streamCount;

    /// @dev streamId => stream.
    mapping(uint256 => Stream) private _streams;

    /// @dev user => stream ids.
    mapping(address => uint256[]) private _byUser;

    event ReinvestorSet(address indexed reinvestor);

    error UnknownStream(uint256 streamId);
    error NotStreamOwner(uint256 streamId, address caller);
    error StreamAlreadyClosed(uint256 streamId);
    error BadWindow(uint64 start, uint64 end);
    error ZeroAmount();
    error ZeroAddress();
    error ReinvestorNotSet();

    constructor(IAdvanceVault vault_, IERC20 usdg_, address admin) {
        if (admin == address(0) || address(vault_) == address(0) || address(usdg_) == address(0)) revert ZeroAddress();
        vault = vault_;
        usdg = usdg_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Point at the reinvest module. Set once at wiring time.
    function setReinvestor(IReinvestor reinvestor_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(reinvestor_) == address(0)) revert ZeroAddress();
        reinvestor = reinvestor_;
        emit ReinvestorSet(address(reinvestor_));
    }

    /// @inheritdoc IStreamEngine
    function startStream(
        address user,
        uint256 dividendId,
        address stockToken,
        uint256 total,
        uint64 start,
        uint64 end,
        Mode mode
    ) external onlyRole(CORE_ROLE) whenNotPaused returns (uint256 streamId) {
        if (user == address(0) || stockToken == address(0)) revert ZeroAddress();
        if (total == 0) revert ZeroAmount();
        if (end <= start) revert BadWindow(start, end);

        streamId = ++streamCount;
        _streams[streamId] = Stream({
            user: user,
            dividendId: dividendId,
            stockToken: stockToken,
            total: SafeCast.toUint128(total),
            claimed: 0,
            start: start,
            end: end,
            mode: mode,
            closed: false
        });
        _byUser[user].push(streamId);

        emit StreamStarted(streamId, user, stockToken, dividendId, total, start, end, mode);
    }

    /// @inheritdoc IStreamEngine
    function claimable(uint256 streamId) public view returns (uint256) {
        Stream storage s = _streams[streamId];
        if (s.user == address(0) || s.closed) return 0;
        return _accrued(s) - s.claimed;
    }

    /// @notice Accrued to date including what has already been pulled.
    function accrued(uint256 streamId) external view returns (uint256) {
        Stream storage s = _streams[streamId];
        if (s.user == address(0)) return 0;
        return _accrued(s);
    }

    /// @notice USDG per second this stream pays, scaled by 1e18 for display precision.
    /// @dev The dashboard uses this to interpolate the live counter between RPC polls.
    function ratePerSecondScaled(uint256 streamId) external view returns (uint256) {
        Stream storage s = _streams[streamId];
        if (s.user == address(0) || s.closed) return 0;
        return (uint256(s.total) * 1e18) / (uint256(s.end) - uint256(s.start));
    }

    /// @inheritdoc IStreamEngine
    function claim(uint256 streamId) external nonReentrant whenNotPaused returns (uint256 amount) {
        Stream storage s = _requireOpen(streamId);
        if (msg.sender != s.user) revert NotStreamOwner(streamId, msg.sender);
        amount = _claim(streamId, s);
    }

    /// @inheritdoc IStreamEngine
    function claimFor(uint256 streamId) external nonReentrant whenNotPaused onlyRole(KEEPER_ROLE) returns (uint256) {
        Stream storage s = _requireOpen(streamId);
        return _claim(streamId, s);
    }

    /// @inheritdoc IStreamEngine
    function claimBatch(uint256[] calldata streamIds)
        external
        nonReentrant
        whenNotPaused
        onlyRole(KEEPER_ROLE)
        returns (uint256 totalClaimed)
    {
        uint256 n = streamIds.length;
        for (uint256 i = 0; i < n; ++i) {
            Stream storage s = _streams[streamIds[i]];
            if (s.user == address(0) || s.closed) continue;
            if (_accrued(s) - s.claimed == 0) continue;
            totalClaimed += _claim(streamIds[i], s);
        }
    }

    /// @inheritdoc IStreamEngine
    function cancelStream(uint256 streamId) external onlyRole(CORE_ROLE) returns (uint256 undrawn) {
        Stream storage s = _requireOpen(streamId);
        undrawn = uint256(s.total) - uint256(s.claimed);
        s.closed = true;
        emit StreamClosed(streamId, s.user, s.claimed, true);
    }

    /// @inheritdoc IStreamEngine
    function getStream(uint256 streamId) external view returns (Stream memory) {
        return _streams[streamId];
    }

    /// @inheritdoc IStreamEngine
    function streamsOf(address user) external view returns (uint256[] memory) {
        return _byUser[user];
    }

    /// @notice Every open stream id for a holder. Convenience for the dashboard.
    function activeStreamsOf(address user) external view returns (uint256[] memory active) {
        uint256[] storage all = _byUser[user];
        uint256 n;
        for (uint256 i = 0; i < all.length; ++i) {
            if (!_streams[all[i]].closed) ++n;
        }
        active = new uint256[](n);
        uint256 j;
        for (uint256 i = 0; i < all.length; ++i) {
            if (!_streams[all[i]].closed) active[j++] = all[i];
        }
    }

    /// @notice Halt claims. Streams keep accruing on paper; nothing is lost.
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

    /// @dev The stream math, in one place.
    function _accrued(Stream storage s) private view returns (uint256) {
        if (block.timestamp <= s.start) return 0;
        uint256 endTs = block.timestamp >= s.end ? s.end : block.timestamp;
        return (uint256(s.total) * (endTs - uint256(s.start))) / (uint256(s.end) - uint256(s.start));
    }

    /// @dev Pull accrued USDG out of the vault and route it. Effects before interactions.
    function _claim(uint256 streamId, Stream storage s) private returns (uint256 amount) {
        amount = _accrued(s) - s.claimed;
        if (amount == 0) return 0;

        s.claimed += SafeCast.toUint128(amount);
        bool finished = s.claimed >= s.total;
        if (finished) s.closed = true;

        address user = s.user;
        Mode mode = s.mode;
        address stockToken = s.stockToken;
        uint256 dividendId = s.dividendId;

        if (mode == Mode.REINVEST) {
            if (address(reinvestor) == address(0)) revert ReinvestorNotSet();
            // Cash goes straight to the reinvest module, never through the wallet.
            vault.releaseAdvance(dividendId, address(reinvestor), amount);
            reinvestor.reinvest(user, stockToken, amount);
            emit StreamClaimed(streamId, user, amount, address(reinvestor));
        } else {
            vault.releaseAdvance(dividendId, user, amount);
            emit StreamClaimed(streamId, user, amount, user);
        }

        if (finished) emit StreamClosed(streamId, user, s.claimed, false);
    }

    /// @dev Reverts unless the stream exists and is open.
    function _requireOpen(uint256 streamId) private view returns (Stream storage s) {
        s = _streams[streamId];
        if (s.user == address(0)) revert UnknownStream(streamId);
        if (s.closed) revert StreamAlreadyClosed(streamId);
    }
}
