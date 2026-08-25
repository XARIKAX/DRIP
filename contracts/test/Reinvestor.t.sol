// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {Reinvestor} from "../src/Reinvestor.sol";
import {IReinvestor} from "../src/interfaces/IReinvestor.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";
import {Mode} from "../src/interfaces/DripTypes.sol";

contract ReinvestorTest is DripTestBase {
    uint256 internal dividendId;
    uint256 internal streamId;
    uint256 internal netTotal;
    uint64 internal exDate;
    uint64 internal payDate;

    function setUp() public override {
        super.setUp();
        depositStock(alice, aapl, 100e18);
        vm.prank(alice);
        core.setMode(address(aapl), Mode.REINVEST);

        fundVault(1_000_000e6);
        dividendId = declare(aapl, 2.20e6, 1 days, 21 days);
        exDate = uint64(block.timestamp) + 1 days;
        payDate = exDate + 21 days;
        vm.warp(exDate);
        (netTotal, streamId) = core.activate(dividendId, alice);
    }

    function test_ClaimBuysStockAndCreditsThePosition() public {
        vm.warp(payDate);
        uint256 balanceBefore = core.balanceOf(alice, address(aapl));

        vm.prank(alice);
        uint256 claimed = stream.claim(streamId);

        // 220 USDG gross, 1 percent advance fee, bought at 220 per share.
        uint256 expectedTokens = (claimed * 1e18) / AAPL_PRICE;

        assertEq(usdg.balanceOf(alice), 0, "cash never touches the wallet");
        assertEq(core.balanceOf(alice, address(aapl)) - balanceBefore, expectedTokens);
        assertEq(reinvestor.totalReinvestedUsdg(address(aapl)), claimed);
        assertEq(reinvestor.totalTokensBought(address(aapl)), expectedTokens);
    }

    function test_ReinvestedTokensAreCreditedOneForOne() public {
        vm.warp(payDate);
        uint256 coreStockBefore = aapl.balanceOf(address(core));
        uint256 positionBefore = core.balanceOf(alice, address(aapl));

        vm.prank(alice);
        stream.claim(streamId);

        uint256 credited = core.balanceOf(alice, address(aapl)) - positionBefore;
        uint256 custodied = aapl.balanceOf(address(core)) - coreStockBefore;
        assertEq(credited, custodied, "every credited token is actually held");
        assertEq(reinvestor.totalTokensBought(address(aapl)), credited);
    }

    function test_CompoundingLoopClosesTheNextDividendIsBigger() public {
        vm.warp(payDate);
        vm.prank(alice);
        stream.claim(streamId);
        settle(dividendId);

        uint256 grownBalance = core.balanceOf(alice, address(aapl));
        assertGt(grownBalance, 100e18);

        uint256 nextId = declare(aapl, 2.20e6, 1 days, 21 days);
        vm.warp(block.timestamp + 1 days);

        uint256 firstGross = 220e6;
        uint256 secondGross = core.pendingEntitlement(nextId, alice);
        assertGt(secondGross, firstGross, "the loop compounds");
        assertEq(secondGross, (grownBalance * 2.20e6) / 1e18);
    }

    function test_RevertWhen_SlippageExceeded() public {
        // The venue suddenly fills 5 percent worse than quoted while alice tolerates 1.
        vm.prank(admin);
        adapter.setSimulatedSlippageBps(500);

        vm.warp(payDate);
        vm.prank(alice);
        vm.expectRevert();
        stream.claim(streamId);
    }

    function test_HolderCanRaiseSlippageTolerance() public {
        vm.prank(admin);
        adapter.setSimulatedSlippageBps(500);

        vm.prank(alice);
        reinvestor.setMaxSlippage(1_000);
        assertEq(reinvestor.maxSlippageBps(alice), 1_000);

        vm.warp(payDate);
        vm.prank(alice);
        stream.claim(streamId);
        assertGt(core.balanceOf(alice, address(aapl)), 100e18);
    }

    function test_DefaultSlippageIsOnePercent() public view {
        assertEq(reinvestor.maxSlippageBps(bob), 100);
    }

    function test_RevertWhen_SlippageAboveCeiling() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Reinvestor.SlippageTooHigh.selector, uint256(1_001)));
        reinvestor.setMaxSlippage(1_001);
    }

    function test_RevertWhen_NotCore() public {
        vm.prank(alice);
        vm.expectRevert();
        reinvestor.reinvest(alice, address(aapl), 1e6);
    }

    function test_ClaimSettledHonoursReinvestMode() public {
        // Bob never activates. He still gets reinvested when he takes the slow lane.
        depositStock(bob, aapl, 100e18);
        vm.prank(bob);
        core.setMode(address(aapl), Mode.REINVEST);

        uint256 id = declare(aapl, 2.20e6, 1 days, 21 days);
        vm.warp(block.timestamp + 1 days);
        settle(id);

        uint256 before = core.balanceOf(bob, address(aapl));
        vm.prank(bob);
        core.claimSettled(id);

        assertEq(usdg.balanceOf(bob), 0);
        assertEq(core.balanceOf(bob, address(aapl)) - before, (220e6 * 1e18) / AAPL_PRICE);
    }
}
