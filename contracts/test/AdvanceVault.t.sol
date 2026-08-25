// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {IAdvanceVault} from "../src/interfaces/IAdvanceVault.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @notice Exercises the vault directly through CORE_ROLE, with no protocol above it.
contract AdvanceVaultTest is DripTestBase {
    address internal fakeCore = makeAddr("fakeCore");

    function setUp() public override {
        super.setUp();
        bytes32 coreRole = vault.CORE_ROLE();
        vm.prank(admin);
        vault.grantRole(coreRole, fakeCore);
    }

    function test_DepositMintsShares() public {
        fundVault(1_000_000e6);
        assertEq(vault.totalAssets(), 1_000_000e6);
        assertGt(vault.balanceOf(lp), 0);
        assertEq(vault.convertToAssets(vault.balanceOf(lp)), 1_000_000e6);
    }

    function test_BookAdvanceRecognisesFeeImmediately() public {
        fundVault(1_000_000e6);
        uint256 before = vault.totalAssets();

        vm.prank(fakeCore);
        uint256 net = vault.bookAdvance(1, alice, 100_000e6);

        assertEq(net, 99_000e6, "1 percent fee");
        assertEq(vault.totalFeesAccrued(), 1_000e6);
        assertEq(vault.totalAssets(), before + 1_000e6, "fee lands the moment risk is taken");
        assertEq(vault.receivables(), 100_000e6);
        assertEq(vault.obligations(), 99_000e6);
    }

    function test_ReleaseIsAssetsNeutral() public {
        fundVault(1_000_000e6);
        vm.startPrank(fakeCore);
        uint256 net = vault.bookAdvance(1, alice, 100_000e6);
        uint256 assetsAfterBook = vault.totalAssets();
        vault.releaseAdvance(1, alice, net);
        vm.stopPrank();

        assertEq(vault.totalAssets(), assetsAfterBook, "paying out moves cash and obligations together");
        assertEq(usdg.balanceOf(alice), net);
        assertEq(vault.obligations(), 0);
    }

    function test_RepayIsAssetsNeutralAndClearsReceivable() public {
        fundVault(1_000_000e6);
        vm.startPrank(fakeCore);
        uint256 net = vault.bookAdvance(1, alice, 100_000e6);
        vault.releaseAdvance(1, alice, net);
        vm.stopPrank();

        uint256 assetsBefore = vault.totalAssets();

        bytes32 coreRole = vault.CORE_ROLE();
        vm.startPrank(admin);
        usdg.approve(address(vault), 100_000e6);
        vault.grantRole(coreRole, admin);
        vault.repayAdvance(1, 100_000e6);
        vm.stopPrank();

        assertEq(vault.totalAssets(), assetsBefore);
        assertEq(vault.receivables(), 0);
        assertEq(vault.receivableOf(1), 0);
    }

    function test_RevertWhen_UtilizationCapBreached() public {
        fundVault(100_000e6);
        // 80 percent cap. Booking 90k gross against ~100k of assets blows past it.
        vm.prank(fakeCore);
        vm.expectRevert(
            abi.encodeWithSelector(AdvanceVault.UtilizationCapBreached.selector, uint256(8_919), uint256(8_000))
        );
        vault.bookAdvance(1, alice, 90_000e6);
    }

    function test_UtilizationCapAllowsExactlyTheCap() public {
        fundVault(100_000e6);
        vm.prank(fakeCore);
        vault.bookAdvance(1, alice, 80_000e6);
        assertLe(vault.utilizationBps(), vault.maxUtilizationBps());
    }

    function test_RevertWhen_CashFloorBreached() public {
        fundVault(10_000e6);
        vm.startPrank(fakeCore);
        uint256 net = vault.bookAdvance(1, alice, 8_000e6);
        vault.releaseAdvance(1, alice, net);
        vm.stopPrank();

        // Cash is now ~2,080. A second advance whose obligation exceeds that must fail
        // even if utilisation would still be inside the cap.
        vm.prank(fakeCore);
        vm.expectRevert();
        vault.bookAdvance(2, bob, 5_000e6);
    }

    function test_LPCannotWithdrawAdvancedCapital() public {
        fundVault(100_000e6);
        vm.startPrank(fakeCore);
        uint256 net = vault.bookAdvance(1, alice, 50_000e6);
        vault.releaseAdvance(1, alice, net);
        vm.stopPrank();

        uint256 maxOut = vault.maxWithdraw(lp);
        assertEq(maxOut, vault.freeCash());
        assertLt(maxOut, vault.convertToAssets(vault.balanceOf(lp)));

        vm.prank(lp);
        vault.withdraw(maxOut, lp, lp);
        assertEq(vault.freeCash(), 0);
    }

    function test_ObligationsAreNeverWithdrawableByLPs() public {
        fundVault(100_000e6);
        vm.prank(fakeCore);
        vault.bookAdvance(1, alice, 50_000e6); // booked, not yet released

        // 49,500 is earmarked for alice. LPs can only touch the rest.
        assertEq(vault.freeCash(), 100_000e6 - 49_500e6);
        assertEq(vault.maxWithdraw(lp), 50_500e6);
    }

    function test_LossWritesDownShareholders() public {
        fundVault(100_000e6);
        vm.startPrank(fakeCore);
        vault.bookAdvance(1, alice, 50_000e6);
        uint256 assetsBefore = vault.totalAssets();
        vault.cancelObligation(1, 49_500e6);
        vault.recordLoss(1, 50_000e6);
        vm.stopPrank();

        assertEq(vault.receivables(), 0);
        assertEq(vault.totalLosses(), 50_000e6);
        assertLt(vault.totalAssets(), assetsBefore);
        assertEq(vault.totalAssets(), 100_000e6, "LPs are back to cash, minus the fee they never earned");
    }

    function test_RevertWhen_NotCoreRole() public {
        fundVault(100_000e6);
        bytes32 coreRole = vault.CORE_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, coreRole)
        );
        vm.prank(alice);
        vault.bookAdvance(1, alice, 1e6);
    }

    function test_FeeAndUtilizationBounds() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(AdvanceVault.FeeTooHigh.selector, uint256(501)));
        vault.setAdvanceFeeBps(501);
        vault.setAdvanceFeeBps(250);
        assertEq(vault.advanceFeeBps(), 250);

        vm.expectRevert(abi.encodeWithSelector(AdvanceVault.UtilizationTooHigh.selector, uint256(9_501)));
        vault.setMaxUtilizationBps(9_501);
        vm.stopPrank();
    }

    function test_PauseBlocksDepositsAndAdvances() public {
        fundVault(100_000e6);
        vm.prank(admin);
        vault.pause();

        assertEq(vault.maxDeposit(lp), 0);
        vm.prank(fakeCore);
        vm.expectRevert();
        vault.bookAdvance(1, alice, 1_000e6);
    }

    function testFuzz_FeeNeverExceedsGross(uint96 gross) public {
        fundVault(4_000_000e6);
        uint256 g = bound(uint256(gross), 1, 1_000_000e6);
        vm.prank(fakeCore);
        uint256 net = vault.bookAdvance(1, alice, g);
        assertLe(net, g);
        assertGe(net, (g * 9_900) / 10_000);
    }
}
