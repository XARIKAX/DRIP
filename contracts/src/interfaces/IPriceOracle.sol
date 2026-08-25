// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPriceOracle
/// @notice Reference price for a stock token, quoted in USDG.
/// @dev Deliberately separate from the swap venue. A slippage guard that reads its
///      reference price out of the pool it is about to trade against guards nothing:
///      move the pool and the guard moves with it. Production must feed this from
///      something the trade cannot influence inside one block, a Chainlink style
///      aggregator or the chain's canonical stock price feed.
interface IPriceOracle {
    /// @notice USDG (6 decimals) per one whole stock token (1e18).
    /// @dev Must revert rather than return a stale or zero price.
    function priceUsdg(address stockToken) external view returns (uint256);
}
