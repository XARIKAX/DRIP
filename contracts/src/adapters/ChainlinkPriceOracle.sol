// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @notice The three members of the Chainlink aggregator surface this oracle reads.
/// @dev Declared locally so the repo carries no Chainlink dependency.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title ChainlinkPriceOracle
/// @notice PRODUCTION price source. One Chainlink USD feed per stock token,
///         converted to the USDG quote the protocol prices in.
/// @dev The listing rules this contract enforces, verbatim from operations:
///
///      1. No feed, no listing. priceUsdg() reverts for a token with no registered
///         feed, and DripCore's clawback and Reinvestor's slippage guard both fail
///         closed with it.
///      2. All feeds are 8-decimal USD read through latestRoundData(). The decimals
///         are read at registration and the conversion to the 6-decimal USDG quote
///         is exact integer math, no floats, no assumptions.
///      3. Staleness is guarded with a heartbeat (default 1 hour). A read older than
///         the heartbeat, a zero or negative answer, or a round that never updated
///         reverts. Never settle on a stale read; fail closed and let the caller
///         refund.
///
///      USDG is treated as the USD unit. If USDG ever floats meaningfully from USD,
///      compose this with a USDG/USD feed rather than editing conversions here.
contract ChainlinkPriceOracle is IPriceOracle, Ownable {
    struct FeedConfig {
        IAggregatorV3 feed;
        uint8 decimals;
        /// @dev Maximum age of a reading before it is refused, in seconds.
        uint48 heartbeat;
    }

    /// @notice Default staleness bound applied at registration. The 1 hour rule.
    uint48 public constant DEFAULT_HEARTBEAT = 1 hours;

    /// @dev stockToken => feed configuration.
    mapping(address => FeedConfig) private _feeds;

    event FeedSet(address indexed stockToken, address indexed feed, uint8 decimals, uint48 heartbeat);

    error NoFeed(address stockToken);
    error StalePrice(address stockToken, uint256 updatedAt, uint48 heartbeat);
    error BadAnswer(address stockToken, int256 answer);
    error IncompleteRound(address stockToken);
    error ZeroAddress();

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Register or replace the feed for a stock token.
    /// @dev Reads decimals() from the feed at registration so a misconfigured feed
    ///      fails here, in an admin transaction, not later inside a user's claim.
    function setFeed(address stockToken, IAggregatorV3 feed, uint48 heartbeat) external onlyOwner {
        if (stockToken == address(0) || address(feed) == address(0)) revert ZeroAddress();
        uint8 feedDecimals = feed.decimals();
        _feeds[stockToken] = FeedConfig({
            feed: feed,
            decimals: feedDecimals,
            heartbeat: heartbeat == 0 ? DEFAULT_HEARTBEAT : heartbeat
        });
        emit FeedSet(stockToken, address(feed), feedDecimals, heartbeat == 0 ? DEFAULT_HEARTBEAT : heartbeat);
    }

    /// @notice The registered feed for a token, for offchain verification.
    function feedOf(address stockToken) external view returns (address feed, uint8 decimals, uint48 heartbeat) {
        FeedConfig storage c = _feeds[stockToken];
        return (address(c.feed), c.decimals, c.heartbeat);
    }

    /// @inheritdoc IPriceOracle
    /// @dev Returns USDG (6 decimals) per one whole stock token. Reverts rather than
    ///      returning anything questionable: no feed, stale round, non-positive
    ///      answer, or a round that answered before it started.
    function priceUsdg(address stockToken) external view returns (uint256) {
        FeedConfig storage c = _feeds[stockToken];
        if (address(c.feed) == address(0)) revert NoFeed(stockToken);

        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = c.feed.latestRoundData();
        if (answer <= 0) revert BadAnswer(stockToken, answer);
        if (answeredInRound < roundId) revert IncompleteRound(stockToken);
        if (updatedAt == 0 || block.timestamp - updatedAt > c.heartbeat) {
            revert StalePrice(stockToken, updatedAt, c.heartbeat);
        }

        // Scale feed decimals (normally 8) to the 6-decimal USDG quote.
        uint256 price = uint256(answer);
        if (c.decimals > 6) return price / (10 ** (c.decimals - 6));
        if (c.decimals < 6) return price * (10 ** (6 - c.decimals));
        return price;
    }
}
