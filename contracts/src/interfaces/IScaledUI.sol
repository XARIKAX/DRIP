// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IScaledUI
/// @notice The one function a Robinhood Chain stock token exposes that this protocol
///         cannot work without: ERC-8056's corporate action multiplier.
/// @dev Stock tokens on this chain do not pay cash dividends. A dividend is
///      reinvested and `uiMultiplier()` rises; `balanceOf` and `totalSupply` never
///      move. Effective shares are `rawBalance * uiMultiplier / 1e18`, so a token
///      tracks the total return of the underlying rather than its share price.
///
///      Everything Osinko calls "yield" is the growth of this number. There is no
///      other source, and no cash to intercept — which is why the declared dividend
///      machinery this protocol shipped with could only ever pay out of Osinko's own
///      pocket, and why the split is funded by the asset itself instead.
interface IScaledUI {
    /// @notice Shares per raw token, 18 decimals. 1e18 means one token is one share.
    function uiMultiplier() external view returns (uint256);
}
