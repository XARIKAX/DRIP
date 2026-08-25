// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Mode} from "./DripTypes.sol";

/// @title IStreamEngine
/// @notice Turns a dividend entitlement into a per second stream from ex date to pay date.
/// @dev Lazy accounting only. Nothing is pushed per block. `claimable` is a pure
///      function of elapsed time, so a stream costs one storage write to open and
///      one per claim. Superfluid style constant flow math without the dependency.
interface IStreamEngine {
    /// @param user       Holder the stream pays.
    /// @param dividendId Dividend the stream draws against.
    /// @param stockToken Stock token the dividend belongs to. Reinvest buys this back.
    /// @param total      Net USDG the stream pays over its whole life.
    /// @param claimed    Net USDG already pulled.
    /// @param start      Stream start, the ex date.
    /// @param end        Stream end, the pay date.
    /// @param mode       STREAM pays the wallet. REINVEST routes every claim to Reinvestor.
    /// @param closed     Set when fully drawn or cancelled.
    struct Stream {
        address user;
        uint256 dividendId;
        address stockToken;
        uint128 total;
        uint128 claimed;
        uint64 start;
        uint64 end;
        Mode mode;
        bool closed;
    }

    event StreamStarted(
        uint256 indexed streamId,
        address indexed user,
        address indexed stockToken,
        uint256 dividendId,
        uint256 total,
        uint64 start,
        uint64 end,
        Mode mode
    );

    event StreamClaimed(uint256 indexed streamId, address indexed user, uint256 amount, address recipient);

    event StreamClosed(uint256 indexed streamId, address indexed user, uint256 totalClaimed, bool cancelled);

    /// @notice Open a stream. Callable by CORE_ROLE (DripCore) only.
    function startStream(
        address user,
        uint256 dividendId,
        address stockToken,
        uint256 total,
        uint64 start,
        uint64 end,
        Mode mode
    ) external returns (uint256 streamId);

    /// @notice USDG accrued and not yet pulled. Zero for closed streams.
    function claimable(uint256 streamId) external view returns (uint256);

    /// @notice Pull everything accrued. Only the stream owner may call.
    function claim(uint256 streamId) external returns (uint256 amount);

    /// @notice Pull everything accrued on a holder's behalf. Callable by KEEPER_ROLE.
    /// @dev Proceeds always go to the holder or to Reinvestor, never to the keeper.
    function claimFor(uint256 streamId) external returns (uint256 amount);

    /// @notice Batch keeper claim. Skips streams with nothing accrued instead of reverting.
    function claimBatch(uint256[] calldata streamIds) external returns (uint256 totalClaimed);

    /// @notice Kill a stream and cancel the undrawn obligation. Callable by CORE_ROLE (void path).
    function cancelStream(uint256 streamId) external returns (uint256 undrawn);

    /// @notice Full stream record.
    function getStream(uint256 streamId) external view returns (Stream memory);

    /// @notice Stream ids owned by a holder, oldest first.
    function streamsOf(address user) external view returns (uint256[] memory);

    /// @notice Number of streams opened. Ids run 1..streamCount().
    function streamCount() external view returns (uint256);
}
