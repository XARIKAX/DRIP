// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Dividend, DividendStatus} from "./DripTypes.sol";

/// @title IDividendRegistry
/// @notice Source of truth for dividend events on Robinhood Chain.
/// @dev Testnet: an admin holds ORACLE_ROLE and declares by hand.
///      Production: a dividend oracle or keeper holds ORACLE_ROLE and feeds
///      declarations from the issuer's corporate action data. The interface does
///      not change, so nothing downstream needs to be redeployed.
interface IDividendRegistry {
    /// @notice A new dividend was declared.
    event DividendDeclared(
        uint256 indexed dividendId,
        address indexed stockToken,
        uint256 amountPerToken,
        uint64 exDate,
        uint64 payDate
    );

    /// @notice The issuer paid. Advances against this dividend are now repayable.
    event DividendSettled(uint256 indexed dividendId, address indexed stockToken, uint256 totalPaid);

    /// @notice The issuer cancelled the dividend. Advances must be clawed back.
    event DividendVoided(uint256 indexed dividendId, address indexed stockToken, string reason);

    /// @notice A stock token became visible to the protocol.
    event SupportedTokenAdded(address indexed stockToken, string symbol);

    /// @notice Declare a dividend. Callable by ORACLE_ROLE.
    /// @param stockToken     Stock token the dividend is paid on.
    /// @param amountPerToken USDG (6 decimals) per one whole stock token (1e18).
    /// @param exDate         Snapshot timestamp. Must be at or after the current block.
    /// @param payDate        Issuer pay timestamp. Must be after exDate.
    /// @return dividendId    Monotonic id, starting at 1.
    function declareDividend(address stockToken, uint256 amountPerToken, uint64 exDate, uint64 payDate)
        external
        returns (uint256 dividendId);

    /// @notice Mark a dividend as paid by the issuer. Callable by SETTLER_ROLE (DripCore).
    function settleDividend(uint256 dividendId, uint256 totalPaid) external;

    /// @notice Mark a dividend as cancelled. Callable by ORACLE_ROLE.
    function voidDividend(uint256 dividendId, string calldata reason) external;

    /// @notice Full record for a dividend id.
    function getDividend(uint256 dividendId) external view returns (Dividend memory);

    /// @notice Number of dividends declared so far. Ids run 1..dividendCount().
    function dividendCount() external view returns (uint256);

    /// @notice Status shortcut used by DripCore on every entitlement path.
    function statusOf(uint256 dividendId) external view returns (DividendStatus);

    /// @notice Every dividend id declared for a stock token, oldest first.
    function dividendsForToken(address stockToken) external view returns (uint256[] memory);

    /// @notice Every stock token the registry has ever seen a declaration for.
    function supportedTokens() external view returns (address[] memory);

    /// @notice Page through dividends for the calendar view.
    /// @param offset Zero based index into ids 1..dividendCount().
    /// @param limit  Maximum records to return.
    function getDividends(uint256 offset, uint256 limit) external view returns (Dividend[] memory);
}
