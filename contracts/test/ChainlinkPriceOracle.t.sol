// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ChainlinkPriceOracle, IAggregatorV3} from "../src/adapters/ChainlinkPriceOracle.sol";

/// @notice A controllable aggregator for exercising every refusal path.
contract MockAggregator is IAggregatorV3 {
    uint8 public decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId = 10;
    uint80 public answeredInRound = 10;

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        updatedAt = block.timestamp;
    }

    function description() external pure returns (string memory) {
        return "MOCK / USD";
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function setRounds(uint80 roundId_, uint80 answeredInRound_) external {
        roundId = roundId_;
        answeredInRound = answeredInRound_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}

contract ChainlinkPriceOracleTest is Test {
    address internal admin = makeAddr("admin");
    address internal token = makeAddr("stock");
    ChainlinkPriceOracle internal oracle;
    MockAggregator internal feed;

    function setUp() public {
        vm.warp(1_756_000_000);
        oracle = new ChainlinkPriceOracle(admin);
        feed = new MockAggregator(8, 220_44000000); // 220.44 USD, 8 decimals
        vm.prank(admin);
        oracle.setFeed(token, feed, 0);
    }

    function test_ScalesEightDecimalsToUsdg() public view {
        assertEq(oracle.priceUsdg(token), 220_440000); // 6 decimals
    }

    function test_RegistrationReadsDecimalsAndAppliesDefaultHeartbeat() public view {
        (address f, uint8 dec, uint48 heartbeat) = oracle.feedOf(token);
        assertEq(f, address(feed));
        assertEq(dec, 8);
        assertEq(heartbeat, 1 hours);
    }

    function test_RevertWhen_NoFeed() public {
        address unlisted = makeAddr("unlisted");
        vm.expectRevert(abi.encodeWithSelector(ChainlinkPriceOracle.NoFeed.selector, unlisted));
        oracle.priceUsdg(unlisted);
    }

    function test_RevertWhen_StalePastHeartbeat() public {
        // Fresh at the boundary, stale one second past it. The 1 hour rule, exactly.
        vm.warp(block.timestamp + 1 hours);
        assertEq(oracle.priceUsdg(token), 220_440000);

        vm.warp(block.timestamp + 1);
        vm.expectRevert(
            abi.encodeWithSelector(ChainlinkPriceOracle.StalePrice.selector, token, uint256(1_756_000_000), uint48(1 hours))
        );
        oracle.priceUsdg(token);
    }

    function test_RevertWhen_AnswerNotPositive() public {
        feed.set(0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkPriceOracle.BadAnswer.selector, token, int256(0)));
        oracle.priceUsdg(token);

        feed.set(-1, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkPriceOracle.BadAnswer.selector, token, int256(-1)));
        oracle.priceUsdg(token);
    }

    function test_RevertWhen_RoundIncomplete() public {
        feed.setRounds(11, 10);
        vm.expectRevert(abi.encodeWithSelector(ChainlinkPriceOracle.IncompleteRound.selector, token));
        oracle.priceUsdg(token);
    }

    function test_CustomHeartbeatRespected() public {
        vm.prank(admin);
        oracle.setFeed(token, feed, 5 minutes);
        vm.warp(block.timestamp + 5 minutes + 1);
        vm.expectRevert();
        oracle.priceUsdg(token);
    }

    function test_SixAndTwelveDecimalFeedsScaleCorrectly() public {
        MockAggregator six = new MockAggregator(6, 62_130000);
        MockAggregator twelve = new MockAggregator(12, 62_130000_000000);
        address a = makeAddr("six");
        address b = makeAddr("twelve");
        vm.startPrank(admin);
        oracle.setFeed(a, six, 0);
        oracle.setFeed(b, twelve, 0);
        vm.stopPrank();
        assertEq(oracle.priceUsdg(a), 62_130000);
        assertEq(oracle.priceUsdg(b), 62_130000);
    }

    function test_OnlyOwnerSetsFeeds() public {
        vm.expectRevert();
        oracle.setFeed(token, feed, 0);
    }
}
