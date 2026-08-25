// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {StreamEngine} from "../src/StreamEngine.sol";
import {IStreamEngine} from "../src/interfaces/IStreamEngine.sol";
import {Mode} from "../src/interfaces/DripTypes.sol";

contract StreamEngineTest is DripTestBase {
    uint256 internal dividendId;
    uint256 internal streamId;
    uint256 internal netTotal;
    uint64 internal exDate;
    uint64 internal payDate;

    function setUp() public override {
        super.setUp();
        depositStock(alice, aapl, 100e18);
        fundVault(1_000_000e6);
        dividendId = declare(aapl, 0.26e6, 1 days, 21 days);
        exDate = uint64(block.timestamp) + 1 days;
        payDate = exDate + 21 days;
        vm.warp(exDate);
        (netTotal, streamId) = core.activate(dividendId, alice);
    }

    function test_NothingAccruesAtTheInstantItStarts() public view {
        assertEq(stream.claimable(streamId), 0);
    }

    function test_AccrualIsLinear() public {
        vm.warp(exDate + 21 days / 4);
        assertApproxEqAbs(stream.claimable(streamId), netTotal / 4, 2);

        vm.warp(exDate + 21 days / 2);
        assertApproxEqAbs(stream.claimable(streamId), netTotal / 2, 2);

        vm.warp(payDate);
        assertEq(stream.claimable(streamId), netTotal);
    }

    function test_AccrualStopsAtPayDate() public {
        vm.warp(payDate + 365 days);
        assertEq(stream.claimable(streamId), netTotal, "a stream never overpays");
    }

    function test_ClaimPaysTheHolderAndAdvancesTheCursor() public {
        vm.warp(exDate + 7 days);
        uint256 expected = stream.claimable(streamId);

        vm.prank(alice);
        uint256 got = stream.claim(streamId);

        assertEq(got, expected);
        assertEq(usdg.balanceOf(alice), expected);
        assertEq(stream.claimable(streamId), 0);
        assertVaultSolvent();
    }

    function test_TotalClaimedNeverExceedsEntitlement() public {
        uint256 total;
        for (uint256 i = 1; i <= 21; ++i) {
            vm.warp(exDate + i * 1 days);
            vm.prank(alice);
            total += stream.claim(streamId);
        }
        assertEq(total, netTotal);
        assertEq(usdg.balanceOf(alice), netTotal);
        assertTrue(stream.getStream(streamId).closed);
    }

    function test_StreamClosesWhenFullyDrawn() public {
        vm.warp(payDate);
        vm.prank(alice);
        stream.claim(streamId);

        IStreamEngine.Stream memory s = stream.getStream(streamId);
        assertTrue(s.closed);
        assertEq(uint256(s.claimed), netTotal);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StreamEngine.StreamAlreadyClosed.selector, streamId));
        stream.claim(streamId);
    }

    function test_RevertWhen_NotStreamOwner() public {
        vm.warp(exDate + 1 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(StreamEngine.NotStreamOwner.selector, streamId, bob));
        stream.claim(streamId);
    }

    function test_KeeperClaimsForHolderButNeverToItself() public {
        vm.warp(exDate + 3 days);
        uint256 expected = stream.claimable(streamId);

        vm.prank(keeper);
        stream.claimFor(streamId);

        assertEq(usdg.balanceOf(alice), expected);
        assertEq(usdg.balanceOf(keeper), 5_000_000e6, "keeper's own balance untouched");
    }

    function test_ClaimBatchSkipsEmptyStreams() public {
        depositStock(bob, aapl, 50e18);
        uint256 secondId = declare(aapl, 0.10e6, 0, 21 days);
        vm.warp(block.timestamp + 1);
        (, uint256 bobStream) = core.activate(secondId, bob);

        vm.warp(exDate + 5 days);
        uint256[] memory ids = new uint256[](3);
        ids[0] = streamId;
        ids[1] = bobStream;
        ids[2] = 9_999; // does not exist

        vm.prank(keeper);
        uint256 claimed = stream.claimBatch(ids);

        assertGt(claimed, 0);
        assertGt(usdg.balanceOf(alice), 0);
        assertGt(usdg.balanceOf(bob), 0);
    }

    function test_RatePerSecondMatchesTheWindow() public view {
        uint256 rate = stream.ratePerSecondScaled(streamId);
        assertEq(rate, (netTotal * 1e18) / (21 days));
    }

    function test_ActiveStreamsOf() public {
        assertEq(stream.activeStreamsOf(alice).length, 1);
        vm.warp(payDate);
        vm.prank(alice);
        stream.claim(streamId);
        assertEq(stream.activeStreamsOf(alice).length, 0);
        assertEq(stream.streamsOf(alice).length, 1);
    }

    function testFuzz_ClaimableNeverExceedsTotal(uint32 elapsed) public {
        vm.warp(exDate + uint256(elapsed));
        assertLe(stream.claimable(streamId), netTotal);
    }

    function testFuzz_SplitClaimsEqualOneClaim(uint32 firstGap) public {
        uint256 gap = bound(uint256(firstGap), 1, 21 days - 1);
        vm.warp(exDate + gap);
        vm.prank(alice);
        uint256 a = stream.claim(streamId);
        vm.warp(payDate);
        vm.prank(alice);
        uint256 b = stream.claim(streamId);
        assertEq(a + b, netTotal);
    }
}
