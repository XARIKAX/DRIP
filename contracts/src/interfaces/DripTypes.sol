// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DripTypes
/// @notice Shared enums and structs for the $DRIP protocol.
/// @dev File level declarations so interfaces and implementations agree on the
///      exact ABI encoding. Do not reorder enum members: the frontend, the SDK
///      and the MCP server all encode modes by index.

/// @notice What a holder wants done with a dividend entitlement.
/// @dev CASH_EARLY  Pay the whole entitlement now, at the ex date, minus the advance fee.
///      STREAM      Drip the entitlement to the wallet per second from ex date to pay date.
///      REINVEST    Same stream, but every claim is swapped straight back into the stock token.
enum Mode {
    CASH_EARLY,
    STREAM,
    REINVEST
}

/// @notice Lifecycle of a declared dividend.
/// @dev DECLARED   Announced. Ex date snapshot applies. Advances may be drawn.
///      SETTLED    The issuer paid. The vault has been made whole.
///      VOIDED     The issuer cancelled. Any advance drawn against it is clawed back.
enum DividendStatus {
    NONE,
    DECLARED,
    SETTLED,
    VOIDED
}

/// @notice A declared dividend event.
/// @param stockToken     The stock token the dividend is paid on.
/// @param amountPerToken USDG (6 decimals) paid per one whole stock token (1e18).
/// @param exDate         Ownership snapshot timestamp. Balances held in DripCore at this second are eligible.
/// @param payDate        When the issuer actually pays. Streams end here.
/// @param declaredAt     Block timestamp of declaration.
/// @param status         Lifecycle status.
struct Dividend {
    address stockToken;
    uint256 amountPerToken;
    uint64 exDate;
    uint64 payDate;
    uint64 declaredAt;
    DividendStatus status;
}
