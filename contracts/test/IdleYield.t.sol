// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {ERC4626IdleYield} from "../src/adapters/ERC4626IdleYield.sol";
import {IIdleYield} from "../src/interfaces/IIdleYield.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockERC4626} from "../src/mocks/MockERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @notice Resting USDG earning while it waits, and the one thing that must never
///         happen because of it: somebody asking for their money and being told it is
///         busy.
contract IdleYieldTest is Test {
    AdvanceVault vault;
    ERC4626IdleYield idle;
    MockERC4626 venue;
    MockUSDG usdg;

    address admin = address(0xA11CE);
    address lp = address(0x11);
    address core = address(0xC0);

    function setUp() public {
        vm.startPrank(admin);
        usdg = new MockUSDG(admin);
        vault = new AdvanceVault(IERC20(address(usdg)), admin);
        venue = new MockERC4626(IERC20(address(usdg)));
        idle = new ERC4626IdleYield(IERC4626(address(venue)), address(vault), admin);

        vault.grantRole(vault.CORE_ROLE(), core);
        vault.setIdleYield(IIdleYield(address(idle)));

        usdg.mint(lp, 10_000e6);
        usdg.mint(admin, 10_000e6);
        vm.stopPrank();

        vm.startPrank(lp);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, lp);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // Parking
    // -----------------------------------------------------------------

    function test_parkingLeavesTheBufferBehind() public {
        uint256 parked = vault.parkIdle();

        // 20% buffer by default, so 800 of the 1000 goes to work.
        assertEq(parked, 800e6, "wrong amount parked");
        assertEq(vault.liquidCash(), 200e6, "buffer not kept");
        assertEq(vault.idleAssets(), 800e6, "venue did not receive it");
    }

    /// @dev The pool must not look poorer for having put its money to work.
    function test_parkingDoesNotChangeWhatThePoolIsWorth() public {
        uint256 before = vault.totalAssets();
        vault.parkIdle();
        assertEq(vault.totalAssets(), before, "parking moved the share price");
        assertEq(vault.cash(), before, "parked cash stopped counting as cash");
    }

    function test_yieldEarnedShowsUpInThePool() public {
        vault.parkIdle();
        uint256 before = vault.totalAssets();

        vm.startPrank(admin);
        usdg.approve(address(venue), 50e6);
        venue.accrue(50e6);
        vm.stopPrank();

        assertApproxEqAbs(vault.totalAssets(), before + 50e6, 1, "the yield did not reach LPs");
    }

    function test_parkingIsPermissionlessAndIdempotent() public {
        vm.prank(address(0xDEAD));
        vault.parkIdle();
        uint256 parked = vault.idleAssets();

        vm.prank(address(0xDEAD));
        assertEq(vault.parkIdle(), 0, "parked twice");
        assertEq(vault.idleAssets(), parked);
    }

    // -----------------------------------------------------------------
    // The rule
    // -----------------------------------------------------------------

    /// @dev An LP asking for more than the buffer holds must still be paid.
    function test_anLpIsPaidEvenWhenTheCashIsBusy() public {
        vault.parkIdle();
        assertEq(vault.liquidCash(), 200e6);

        uint256 before = usdg.balanceOf(lp);
        vm.prank(lp);
        vault.withdraw(900e6, lp, lp); // far past the buffer

        assertEq(usdg.balanceOf(lp) - before, 900e6, "the LP was short-changed");
    }

    function test_redeemingEverythingWorksWhileParked() public {
        vault.parkIdle();

        uint256 shares = vault.balanceOf(lp);
        vm.prank(lp);
        vault.redeem(shares, lp, lp);

        assertApproxEqAbs(usdg.balanceOf(lp), 10_000e6, 2, "could not get out in full");
        assertEq(vault.idleAssets(), 0, "left money behind at the venue");
    }

    function test_anAdvanceIsReleasedEvenWhenTheCashIsBusy() public {
        vm.prank(core);
        vault.bookAdvance(1, lp, 500e6);
        vault.parkIdle();

        uint256 before = usdg.balanceOf(lp);
        vm.prank(core);
        vault.releaseAdvance(1, lp, 400e6);
        assertGe(usdg.balanceOf(lp) - before, 400e6, "the holder was not paid");
    }

    /// @dev Obligations are never parked. Money promised to a holder mid stream stays
    ///      where it can be handed over.
    function test_obligationsAreNeverSentToEarn() public {
        // Inside the utilisation cap: booking 900 against a 1000 pool is refused by
        // the vault on its own terms, which is a different rule than this one.
        vm.prank(core);
        vault.bookAdvance(1, lp, 700e6);

        uint256 owed = vault.obligations();
        assertGt(owed, 0, "nothing was booked");

        vault.parkIdle();
        assertGe(vault.liquidCash(), owed, "parked money that was already promised");
    }

    // -----------------------------------------------------------------
    // When the venue will not pay
    // -----------------------------------------------------------------

    /// @dev The failure that matters. A venue that locks up must produce a clear
    ///      revert naming what could not be fetched, not a silent ERC20 underflow
    ///      three frames deeper.
    function test_aVenueThatWillNotPayFailsLoudly() public {
        vault.parkIdle();
        venue.setWithdrawalCap(0);

        vm.prank(lp);
        vm.expectRevert(
            abi.encodeWithSelector(AdvanceVault.IdleWithdrawalFailed.selector, 700e6, 0)
        );
        vault.withdraw(900e6, lp, lp);
    }

    /// @dev And the buffer still works while the venue is stuck, so small payouts are
    ///      unaffected by a problem at the far end.
    function test_theBufferKeepsSmallPayoutsWorkingWhileTheVenueIsStuck() public {
        vault.parkIdle();
        venue.setWithdrawalCap(0);

        uint256 before = usdg.balanceOf(lp);
        vm.prank(lp);
        vault.withdraw(150e6, lp, lp);
        assertEq(usdg.balanceOf(lp) - before, 150e6, "the buffer did not cover a small withdrawal");
    }

    function test_windingTheVenueDownBringsEverythingHome() public {
        vault.parkIdle();
        vm.prank(admin);
        vault.unparkAll();

        assertEq(vault.idleAssets(), 0);
        assertEq(vault.liquidCash(), 1_000e6, "did not come home whole");
    }

    // -----------------------------------------------------------------
    // Access
    // -----------------------------------------------------------------

    function test_onlyThePoolCanUseItsOwnAdapter() public {
        vm.startPrank(admin);
        usdg.approve(address(idle), 100e6);
        vm.expectRevert(abi.encodeWithSelector(ERC4626IdleYield.NotDepositor.selector, admin));
        idle.deposit(100e6);
        vm.stopPrank();
    }

    function test_theOwnerCannotRescueThePosition() public {
        vault.parkIdle();
        vm.startPrank(admin);
        vm.expectRevert();
        idle.rescue(address(usdg), admin, 1e6);
        vm.expectRevert();
        idle.rescue(address(venue), admin, 1e6);
        vm.stopPrank();
    }

    function test_withNoVenueThePoolBehavesExactlyAsBefore() public {
        vm.prank(admin);
        vault.setIdleYield(IIdleYield(address(0)));

        assertEq(vault.parkIdle(), 0);
        assertEq(vault.idleAssets(), 0);
        assertEq(vault.cash(), vault.liquidCash());

        vm.prank(lp);
        vault.withdraw(900e6, lp, lp);
    }
}
