// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {Mode, DividendStatus} from "../src/interfaces/DripTypes.sol";

/// @notice The definition of done, executed.
/// @dev Fresh wallet faucets tokens, deposits AAPL, picks Stream, watches the counter
///      accrue, claims, sees the reinvest buy more AAPL, and checks the vault moved.
contract IntegrationTest is DripTestBase {
    function test_TheWholeThing() public {
        address user = makeAddr("freshWallet");

        // 1. LPs put up the capital that makes early payment possible.
        fundVault(1_000_000e6);
        uint256 sharePriceAtStart = vault.convertToAssets(1e18);

        // 2. Fresh wallet uses the faucet. Two clicks on the dashboard.
        vm.prank(user);
        aapl.faucet();
        assertEq(aapl.balanceOf(user), 100e18);

        // 3. Deposit and pick REINVEST.
        vm.startPrank(user);
        aapl.approve(address(core), 100e18);
        core.deposit(address(aapl), 100e18);
        core.setMode(address(aapl), Mode.REINVEST);
        vm.stopPrank();

        // 4. A dividend is declared. Ex date tomorrow, issuer pays in 21 days.
        uint256 id = declare(aapl, 2.20e6, 1 days, 21 days);
        uint64 exDate = uint64(block.timestamp) + 1 days;
        uint64 payDate = exDate + 21 days;

        // 5. Ex date. The entitlement is routed. In the old world nothing happens for
        //    three more weeks.
        vm.warp(exDate);
        (uint256 net, uint256 streamId) = core.activate(id, user);
        assertEq(net, 217.8e6, "220 USDG gross, 1 percent advance fee");
        assertGt(streamId, 0);

        // 6. The counter ticks. Half way through the window, half the money exists.
        vm.warp(exDate + 10 days + 12 hours);
        assertApproxEqAbs(stream.claimable(streamId), net / 2, 2);

        // 7. Claim. USDG never touches the wallet: it is swapped straight into AAPL
        //    and credited back to the position.
        uint256 positionBefore = core.balanceOf(user, address(aapl));
        vm.prank(user);
        uint256 claimed = stream.claim(streamId);

        assertEq(usdg.balanceOf(user), 0);
        assertEq(core.balanceOf(user, address(aapl)) - positionBefore, (claimed * 1e18) / AAPL_PRICE);
        assertVaultSolvent();

        // 8. The issuer finally pays. The vault is made whole and keeps the fee.
        vm.warp(payDate);
        settle(id);
        assertEq(uint8(registry.statusOf(id)), uint8(DividendStatus.SETTLED));
        assertEq(vault.receivableOf(id), 0);

        // 9. The rest of the stream is still there, funded by settled cash now.
        vm.prank(user);
        uint256 tail = stream.claim(streamId);
        assertEq(claimed + tail, net, "the stream pays exactly the entitlement, never more");

        // 10. LP yield moved. That is the whole business model in one assertion.
        assertGt(vault.convertToAssets(1e18), sharePriceAtStart, "the fee became LP yield");
        assertEq(vault.totalFeesAccrued(), 2.2e6);
        assertVaultSolvent();
    }

    function test_ThreeHoldersThreeModesOneDividend() public {
        fundVault(1_000_000e6);
        address carol = makeAddr("carol");
        vm.prank(admin);
        aapl.mint(carol, 100e18);

        depositStock(alice, aapl, 100e18);
        depositStock(bob, aapl, 100e18);
        depositStock(carol, aapl, 100e18);

        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);
        vm.prank(bob);
        core.setMode(address(aapl), Mode.STREAM);
        vm.prank(carol);
        core.setMode(address(aapl), Mode.REINVEST);

        uint256 id = declare(aapl, 1.00e6, 1 days, 21 days);
        uint64 exDate = uint64(block.timestamp) + 1 days;
        vm.warp(exDate);

        address[] memory users = new address[](3);
        users[0] = alice;
        users[1] = bob;
        users[2] = carol;
        core.activateBatch(id, users);

        // Alice has cash today. Bob and carol have streams.
        assertEq(usdg.balanceOf(alice), 99e6);
        assertEq(usdg.balanceOf(bob), 0);
        assertEq(stream.activeStreamsOf(bob).length, 1);
        assertEq(stream.activeStreamsOf(carol).length, 1);

        // Run the window out and drain everything.
        vm.warp(exDate + 21 days);
        uint256 bobStream = stream.activeStreamsOf(bob)[0];
        uint256 carolStream = stream.activeStreamsOf(carol)[0];
        vm.prank(bob);
        stream.claim(bobStream);
        vm.prank(carol);
        stream.claim(carolStream);

        assertEq(usdg.balanceOf(bob), 99e6);
        assertEq(usdg.balanceOf(carol), 0, "carol compounded instead");
        assertGt(core.balanceOf(carol, address(aapl)), 100e18);

        settle(id);
        assertEq(vault.receivables(), 0);
        assertEq(vault.totalFeesAccrued(), 3e6, "1 percent of 300 USDG");
        assertVaultSolvent();
    }

    function test_HoldersWhoDoNothingStillGetPaidAtPayDate() public {
        fundVault(1_000_000e6);
        depositStock(bob, aapl, 100e18);

        uint256 id = declare(aapl, 1.00e6, 1 days, 21 days);
        vm.warp(block.timestamp + 22 days);
        settle(id);

        vm.prank(bob);
        core.claimSettled(id);

        assertEq(usdg.balanceOf(bob), 100e6, "no advance, no fee, exactly what the issuer paid");
        assertEq(vault.totalFeesAccrued(), 0);
    }

    function test_VoidedDividendIsRecoveredAndLPsAreNotWiped() public {
        fundVault(1_000_000e6);
        depositStock(alice, aapl, 100e18);
        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        uint256 id = declare(aapl, 2.20e6, 1 days, 21 days);
        vm.warp(block.timestamp + 1 days);
        core.activate(id, alice);

        uint256 assetsBeforeVoid = vault.totalAssets();

        vm.prank(admin);
        registry.voidDividend(id, "issuer cancelled");
        vm.prank(keeper);
        core.clawback(id, alice);

        // The receivable is gone, so assets fall by the gross that will never arrive.
        assertEq(vault.receivables(), 0);
        assertEq(vault.totalLosses(), 220e6);
        assertEq(vault.totalAssets(), assetsBeforeVoid - 220e6);

        // But the vault holds AAPL worth roughly the cash it paid out.
        uint256 seized = aapl.balanceOf(address(vault));
        assertApproxEqRel((seized * AAPL_PRICE) / 1e18, 217.8e6, 0.001e18);
        assertVaultSolvent();
    }
}
