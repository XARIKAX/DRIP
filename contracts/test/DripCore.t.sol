// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {DripCore} from "../src/DripCore.sol";
import {IDripCore} from "../src/interfaces/IDripCore.sol";
import {IStreamEngine} from "../src/interfaces/IStreamEngine.sol";
import {Mode, DividendStatus} from "../src/interfaces/DripTypes.sol";

contract DripCoreTest is DripTestBase {
    function test_DepositWritesCheckpointsAndDefaultsToStream() public {
        vm.startPrank(alice);
        aapl.approve(address(core), 100e18);
        vm.expectEmit(true, true, false, true, address(core));
        emit IDripCore.ModeSet(alice, address(aapl), Mode.STREAM);
        core.deposit(address(aapl), 100e18);
        vm.stopPrank();

        assertEq(core.balanceOf(alice, address(aapl)), 100e18);
        assertEq(core.totalDeposited(address(aapl)), 100e18);
        assertEq(uint8(core.positionOf(alice, address(aapl)).mode), uint8(Mode.STREAM));
        assertTrue(core.positionOf(alice, address(aapl)).initialized);
        assertEq(core.tokensOf(alice).length, 1);
    }

    function test_BalanceOfAtIsTheEligibilityProof() public {
        depositStock(alice, aapl, 100e18);
        uint64 t1 = uint64(block.timestamp);

        vm.warp(block.timestamp + 1 days);
        depositStock(alice, aapl, 50e18);
        uint64 t2 = uint64(block.timestamp);

        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        core.withdraw(address(aapl), 120e18);
        uint64 t3 = uint64(block.timestamp);

        assertEq(core.balanceOfAt(alice, address(aapl), t1 - 1), 0);
        assertEq(core.balanceOfAt(alice, address(aapl), t1), 100e18);
        assertEq(core.balanceOfAt(alice, address(aapl), t2), 150e18);
        assertEq(core.balanceOfAt(alice, address(aapl), t3), 30e18);
        assertEq(core.totalDepositedAt(address(aapl), t2), 150e18);
    }

    function test_WithdrawAfterExDateKeepsEligibility() public {
        depositStock(alice, aapl, 100e18);
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);

        vm.warp(block.timestamp + 1 days + 1);
        // Alice pulls her stock out the second the ex date passes. The dividend is hers.
        vm.prank(alice);
        core.withdraw(address(aapl), 100e18);

        assertEq(core.pendingEntitlement(id, alice), 26e6);
        core.activate(id, alice);
        assertEq(core.entitlementOf(id, alice).gross, 26e6);
    }

    function test_DepositAfterExDateEarnsNothing() public {
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);

        vm.warp(block.timestamp + 1 days + 1);
        depositStock(alice, aapl, 100e18);

        assertEq(core.pendingEntitlement(id, alice), 0);
        vm.expectRevert(abi.encodeWithSelector(DripCore.NothingEligible.selector, id, alice));
        core.activate(id, alice);
    }

    function test_CashEarlyPaysNetImmediately() public {
        depositStock(alice, aapl, 100e18);
        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);

        (uint256 net, uint256 streamId) = core.activate(id, alice);

        assertEq(net, 25.74e6, "26 USDG gross, 1 percent fee");
        assertEq(streamId, 0);
        assertEq(usdg.balanceOf(alice), 25.74e6);
        assertVaultSolvent();
    }

    function test_StreamModeOpensStreamOverTheWholeWindow() public {
        depositStock(alice, aapl, 100e18);
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);

        (uint256 net, uint256 streamId) = core.activate(id, alice);
        assertGt(streamId, 0);

        IStreamEngine.Stream memory s = stream.getStream(streamId);
        assertEq(s.user, alice);
        assertEq(uint256(s.total), net);
        assertEq(uint256(s.end) - uint256(s.start), 21 days);
        assertEq(usdg.balanceOf(alice), 0, "nothing paid up front, it drips");
        assertVaultSolvent();
    }

    function test_RevertWhen_ActivatingTwice() public {
        depositStock(alice, aapl, 100e18);
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);

        core.activate(id, alice);
        vm.expectRevert(abi.encodeWithSelector(DripCore.AlreadyActivated.selector, id, alice));
        core.activate(id, alice);
    }

    function test_RevertWhen_ActivatingBeforeExDate() public {
        depositStock(alice, aapl, 100e18);
        uint256 id = declare(aapl, 1 days, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.expectRevert(
            abi.encodeWithSelector(DripCore.BeforeExDate.selector, uint64(block.timestamp + 1 days))
        );
        core.activate(id, alice);
    }

    function test_ActivateBatchSkipsTheImpossible() public {
        depositStock(alice, aapl, 100e18);
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);

        address[] memory users = new address[](3);
        users[0] = alice;
        users[1] = bob; // no deposit, nothing eligible
        users[2] = alice; // duplicate, already activated by the time it is reached

        core.activateBatch(id, users);

        assertTrue(core.entitlementOf(id, alice).activated);
        assertFalse(core.entitlementOf(id, bob).activated);
    }

    function test_SettlementRepaysVaultAndParksTheRest() public {
        depositStock(alice, aapl, 100e18); // activates
        depositStock(bob, aapl, 100e18); // never activates
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);

        core.activate(id, alice);
        uint256 receivable = vault.receivableOf(id);
        assertEq(receivable, 26e6);

        settle(id);

        assertEq(uint8(registry.statusOf(id)), uint8(DividendStatus.SETTLED));
        assertEq(vault.receivableOf(id), 0);
        assertEq(core.settledPool(id), 26e6, "bob's share is waiting for him");
        assertVaultSolvent();
    }

    function test_ClaimSettledIsTheSlowLaneWithNoFee() public {
        depositStock(bob, aapl, 100e18);
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);
        settle(id);

        vm.prank(bob);
        uint256 amount = core.claimSettled(id);

        assertEq(amount, 26e6, "full gross, no advance fee, paid at the pay date");
        assertEq(usdg.balanceOf(bob), 26e6);
        assertEq(core.settledPool(id), 0);
    }

    function test_RevertWhen_ClaimSettledTwice() public {
        depositStock(bob, aapl, 100e18);
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);
        settle(id);

        vm.startPrank(bob);
        core.claimSettled(id);
        vm.expectRevert(abi.encodeWithSelector(DripCore.AlreadyClaimed.selector, id, bob));
        core.claimSettled(id);
        vm.stopPrank();
    }

    function test_ClawbackSeizesCollateralAndWritesOff() public {
        depositStock(alice, aapl, 100e18);
        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);
        core.activate(id, alice);

        uint256 cashOut = 25.74e6;
        assertEq(usdg.balanceOf(alice), cashOut);

        vm.prank(admin);
        registry.voidDividend(id, "issuer cancelled");

        uint256 vaultStockBefore = aapl.balanceOf(address(vault));
        vm.prank(keeper);
        core.clawback(id, alice);

        // Seized stock is priced off the swap adapter: 25.74 USDG at 220 per share.
        uint256 expectedSeize = (cashOut * 1e18) / AAPL_PRICE;
        assertEq(aapl.balanceOf(address(vault)) - vaultStockBefore, expectedSeize);
        assertEq(core.balanceOf(alice, address(aapl)), 100e18 - expectedSeize);
        assertEq(vault.receivableOf(id), 0, "receivable written off");
        assertEq(vault.totalLosses(), 26e6);
        assertTrue(core.entitlementOf(id, alice).clawedBack);
    }

    function test_ClawbackCancelsUndrawnStream() public {
        depositStock(alice, aapl, 100e18);
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        fundVault(1_000_000e6);
        vm.warp(block.timestamp + 1 days);
        (, uint256 streamId) = core.activate(id, alice);

        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        stream.claim(streamId);
        uint256 drawn = usdg.balanceOf(alice);
        assertGt(drawn, 0);

        vm.prank(admin);
        registry.voidDividend(id, "issuer cancelled");
        vm.prank(keeper);
        core.clawback(id, alice);

        assertTrue(stream.getStream(streamId).closed);
        assertEq(vault.obligationOf(id), 0, "undrawn obligation cancelled");
        assertVaultSolvent();
    }

    function test_WithdrawMoreThanBalanceReverts() public {
        depositStock(alice, aapl, 10e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DripCore.InsufficientBalance.selector, 10e18, 11e18));
        core.withdraw(address(aapl), 11e18);
    }

    function test_PauseBlocksUserEntryPoints() public {
        vm.prank(admin);
        core.pause();
        vm.startPrank(alice);
        aapl.approve(address(core), 1e18);
        vm.expectRevert();
        core.deposit(address(aapl), 1e18);
        vm.stopPrank();
    }

    function testFuzz_EntitlementScalesWithBalance(uint96 rawAmount, uint64 rawPerToken) public {
        uint256 amount = bound(uint256(rawAmount), 1e15, 1_000e18);
        uint256 perToken = bound(uint256(rawPerToken), 1, 10e6);

        vm.prank(admin);
        aapl.mint(alice, amount);
        depositStock(alice, aapl, amount);

        uint256 id = declare(aapl, perToken, 1 days, 21 days);
        vm.warp(block.timestamp + 1 days);

        assertEq(core.pendingEntitlement(id, alice), (amount * perToken) / 1e18);
    }
}
