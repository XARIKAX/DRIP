// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {PrincipalToken} from "../src/PrincipalToken.sol";
import {YieldToken} from "../src/YieldToken.sol";
import {IDripCore} from "../src/interfaces/IDripCore.sol";
import {IDividendRegistry} from "../src/interfaces/IDividendRegistry.sol";

/// @title SplitVaultTest
/// @notice Split, merge, redeem, harvest, claim — and the invariant the whole
///         contract leans on: this vault's DripCore balance for a stock token is
///         always exactly the active series' PT supply.
contract SplitVaultTest is DripTestBase {
    SplitVault internal split;

    address internal carol = makeAddr("carol");

    function setUp() public override {
        super.setUp();

        vm.prank(admin);
        split = new SplitVault(
            IDripCore(address(core)), IDividendRegistry(address(registry)), usdg, admin
        );

        // SplitVault deposits into DripCore like any other holder — no special role.
        vm.prank(admin);
        aapl.mint(carol, 1_000e18);

        fundVault(2_000_000e6);
    }

    // ------------------------------------------------------------------
    // Series lifecycle
    // ------------------------------------------------------------------

    function test_CreateSeries() public {
        uint256 maturity = block.timestamp + 60 days;
        vm.prank(admin);
        uint256 id = split.createSeries(address(aapl), uint64(maturity));

        (address stockToken, uint64 mat, address pt, address yt, bool exists) = split.series(id);
        assertEq(stockToken, address(aapl));
        assertEq(mat, maturity);
        assertTrue(exists);
        assertTrue(pt != address(0));
        assertTrue(yt != address(0));
        assertEq(split.activeSeriesOf(address(aapl)), id);
    }

    function test_CreateSeries_RevertsForNonKeeper() public {
        vm.prank(alice);
        vm.expectRevert();
        split.createSeries(address(aapl), uint64(block.timestamp + 30 days));
    }

    function test_CreateSeries_RevertsPastMaturity() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SplitVault.MaturityInPast.selector, uint64(block.timestamp)));
        split.createSeries(address(aapl), uint64(block.timestamp));
    }

    function test_CreateSeries_RevertsWhilePriorSeriesStillActive() public {
        uint256 id = _openSeries(60 days);
        _split(id, alice, 100e18);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SplitVault.SeriesStillActive.selector, id, address(aapl)));
        split.createSeries(address(aapl), uint64(block.timestamp + 90 days));
    }

    function test_CreateSeries_AllowedOnceFullyRedeemed() public {
        uint256 id = _openSeries(1 days);
        uint256 minted = _split(id, alice, 100e18);

        vm.warp(block.timestamp + 2 days);
        vm.prank(alice);
        split.redeemPrincipal(id, minted);

        vm.prank(admin);
        uint256 id2 = split.createSeries(address(aapl), uint64(block.timestamp + 30 days));
        assertEq(split.activeSeriesOf(address(aapl)), id2);
    }

    // ------------------------------------------------------------------
    // Split / merge / redeem
    // ------------------------------------------------------------------

    function test_Split_MintsNetOfFee() public {
        uint256 id = _openSeries(30 days);

        vm.prank(admin);
        split.setSplitFeeBps(10); // 0.10%, the Fletch-quoted figure

        uint256 amount = 1_000e18;
        uint256 minted = _split(id, alice, amount);

        uint256 expectedFee = (amount * 10) / 10_000;
        assertEq(minted, amount - expectedFee);
        assertEq(split.feesOwed(address(aapl)), expectedFee);

        (,, address pt, address yt,) = split.series(id);
        assertEq(PrincipalToken(pt).balanceOf(alice), minted);
        assertEq(YieldToken(yt).balanceOf(alice), minted);

        // The identity the whole contract is built on.
        assertEq(core.balanceOf(address(split), address(aapl)), minted);
        assertEq(PrincipalToken(pt).totalSupply(), core.balanceOf(address(split), address(aapl)));
    }

    function test_Split_RevertsAfterMaturity() public {
        uint256 id = _openSeries(1 days);
        vm.warp(block.timestamp + 2 days);

        vm.startPrank(alice);
        aapl.approve(address(split), 100e18);
        vm.expectRevert();
        split.split(id, 100e18);
        vm.stopPrank();
    }

    function test_Merge_ReturnsStockAndBurnsBoth() public {
        uint256 id = _openSeries(30 days);
        uint256 minted = _split(id, alice, 500e18);

        uint256 balBefore = aapl.balanceOf(alice);
        vm.startPrank(alice);
        split.merge(id, minted);
        vm.stopPrank();

        assertEq(aapl.balanceOf(alice), balBefore + minted);
        (,, address pt, address yt,) = split.series(id);
        assertEq(PrincipalToken(pt).balanceOf(alice), 0);
        assertEq(YieldToken(yt).balanceOf(alice), 0);
    }

    function test_RedeemPrincipal_RevertsBeforeMaturity() public {
        uint256 id = _openSeries(30 days);
        uint256 minted = _split(id, alice, 200e18);

        vm.prank(alice);
        vm.expectRevert();
        split.redeemPrincipal(id, minted);
    }

    function test_RedeemPrincipal_WorksAfterMaturity_LeavesYtWorthless() public {
        uint256 id = _openSeries(1 days);
        uint256 minted = _split(id, alice, 200e18);

        vm.warp(block.timestamp + 2 days);
        uint256 balBefore = aapl.balanceOf(alice);
        vm.prank(alice);
        split.redeemPrincipal(id, minted);

        assertEq(aapl.balanceOf(alice), balBefore + minted);
        (,, address pt,,) = split.series(id);
        assertEq(PrincipalToken(pt).totalSupply(), 0);
    }

    // ------------------------------------------------------------------
    // Harvest and claim
    // ------------------------------------------------------------------

    function test_Harvest_PaysSplitVaultAndClaimIsProRata() public {
        uint256 id = _openSeries(60 days);

        // Alice splits 600, Bob splits 400 — 60/40 of the pool, checkpointed at
        // whatever moment each of them actually held YT at the ex date.
        uint256 aliceYt = _split(id, alice, 600e18);
        uint256 bobYt = _split(id, bob, 400e18);

        uint256 divId = declare(aapl, 2e6, 3 days, 20 days); // $2 per share, 1000 eligible

        vm.warp(block.timestamp + 3 days); // past the ex date

        uint256 usdgBefore = usdg.balanceOf(address(split));
        split.harvestDividend(id, divId); // permissionless — anyone can call it
        uint256 net = usdg.balanceOf(address(split)) - usdgBefore;
        assertGt(net, 0);
        assertEq(split.dividendPool(id, divId), net);
        assertEq(split.dividendYtSupplyAtHarvest(id, divId), aliceYt + bobYt);

        uint256 aliceClaim = split.pendingYield(id, divId, alice);
        uint256 bobClaim = split.pendingYield(id, divId, bob);
        assertApproxEqRel(aliceClaim, (net * aliceYt) / (aliceYt + bobYt), 1);
        assertApproxEqRel(bobClaim, (net * bobYt) / (aliceYt + bobYt), 1);
        assertLe(aliceClaim + bobClaim, net, "claims must never exceed the harvested pool");

        uint256 aliceBalBefore = usdg.balanceOf(alice);
        vm.prank(alice);
        uint256 paid = split.claimYield(id, divId);
        assertEq(paid, aliceClaim);
        assertEq(usdg.balanceOf(alice), aliceBalBefore + aliceClaim);

        // Second claim is nothing — already paid.
        vm.prank(alice);
        vm.expectRevert(SplitVault.NothingToClaim.selector);
        split.claimYield(id, divId);
    }

    function test_Harvest_TransferAfterExDate_DoesNotChangeEntitlement() public {
        uint256 id = _openSeries(60 days);
        uint256 aliceYt = _split(id, alice, 1_000e18);

        uint256 divId = declare(aapl, 1e6, 2 days, 20 days);
        vm.warp(block.timestamp + 2 days); // now exactly at the ex date
        vm.warp(block.timestamp + 1); // and now strictly after it — the transfer
        // below must land on a later checkpoint key than the snapshot itself, or the
        // ordering within the same second is genuinely ambiguous, not a bug to prove.

        // Alice sells her whole YT position to Carol *after* the snapshot. The
        // checkpoint proof at the ex date must still say it was Alice's.
        (,,, address yt,) = split.series(id);
        vm.prank(alice);
        YieldToken(yt).transfer(carol, aliceYt);
        assertEq(YieldToken(yt).balanceOf(alice), 0);
        assertEq(YieldToken(yt).balanceOf(carol), aliceYt);

        split.harvestDividend(id, divId);

        assertGt(split.pendingYield(id, divId, alice), 0, "the ex-date holder is still owed the yield");
        assertEq(split.pendingYield(id, divId, carol), 0, "a post-snapshot buyer gets nothing from this dividend");
    }

    function test_Harvest_RevertsTwice() public {
        uint256 id = _openSeries(60 days);
        _split(id, alice, 500e18);
        uint256 divId = declare(aapl, 1e6, 2 days, 20 days);
        vm.warp(block.timestamp + 2 days);

        split.harvestDividend(id, divId);
        vm.expectRevert(abi.encodeWithSelector(SplitVault.AlreadyHarvested.selector, id, divId));
        split.harvestDividend(id, divId);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _openSeries(uint256 durationFromNow) internal returns (uint256 id) {
        vm.prank(admin);
        id = split.createSeries(address(aapl), uint64(block.timestamp + durationFromNow));
    }

    function _split(uint256 seriesId, address user, uint256 amount) internal returns (uint256 minted) {
        vm.startPrank(user);
        aapl.approve(address(split), amount);
        minted = split.split(seriesId, amount);
        vm.stopPrank();
    }
}
