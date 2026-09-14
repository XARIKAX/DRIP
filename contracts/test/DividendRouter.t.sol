// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DividendRouter} from "../src/DividendRouter.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";

/// @notice One saved setting, applied to every payout after it. The tests that matter
///         are the ones about custody: this contract must never end a call holding
///         anything, and nobody must be able to move anybody else's tokens through it.
contract DividendRouterTest is Test {
    DividendRouter router;
    MockSwapAdapter adapter;
    MockUSDG usdg;
    MockStockToken aapl;
    MockStockToken btc; // stands in for whatever the holder wants to end up in

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address sister = address(0x515);

    function setUp() public {
        vm.startPrank(admin);
        usdg = new MockUSDG(admin);
        aapl = new MockStockToken("Apple", "AAPL", admin);
        btc = new MockStockToken("Bitcoin", "BTC", admin);
        adapter = new MockSwapAdapter(address(usdg), admin);

        adapter.setPrice(address(aapl), 300e6);
        adapter.setPrice(address(btc), 60_000e6);

        router = new DividendRouter(ISwapAdapter(address(adapter)), address(usdg), admin);

        aapl.mint(alice, 100e18);
        // The adapter fills from its own inventory.
        btc.mint(address(adapter), 100e18);
        usdg.mint(address(adapter), 1_000_000e6);
        vm.stopPrank();
    }

    function _setRoute(address who, address tokenOut, address recipient, uint16 bps) internal {
        vm.prank(who);
        router.setRoute(tokenOut, recipient, bps);
    }

    // -----------------------------------------------------------------
    // The product
    // -----------------------------------------------------------------

    function test_getPaidYourAppleDividendInBitcoin() public {
        _setRoute(alice, address(btc), address(0), 100);

        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        uint256 out = router.route(address(aapl), 1e18, 0);
        vm.stopPrank();

        assertGt(out, 0, "routed nothing");
        assertEq(btc.balanceOf(alice), out, "the bitcoin did not arrive");
        assertEq(aapl.balanceOf(alice), 99e18, "wrong amount taken");
    }

    function test_payItToSomebodyElse() public {
        _setRoute(alice, address(usdg), sister, 100);

        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        uint256 out = router.route(address(aapl), 1e18, 0);
        vm.stopPrank();

        assertEq(usdg.balanceOf(sister), out, "the sister was not paid");
        assertEq(usdg.balanceOf(alice), 0, "the holder was paid instead");
    }

    /// @dev Routing to the token you already hold is a transfer. Sending it through a
    ///      pool would pay a spread to arrive exactly where it started.
    function test_routingToTheSameTokenCostsNoSpread() public {
        _setRoute(alice, address(aapl), sister, 100);
        vm.prank(admin);
        adapter.setSimulatedSlippageBps(500); // a pool that would cost 5%

        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        uint256 out = router.route(address(aapl), 1e18, 0);
        vm.stopPrank();

        assertEq(out, 1e18, "a spread was paid on a transfer");
        assertEq(aapl.balanceOf(sister), 1e18);
    }

    function test_oneSettingAppliesToEveryPayoutAfterIt() public {
        _setRoute(alice, address(btc), address(0), 100);

        vm.startPrank(alice);
        aapl.approve(address(router), type(uint256).max);
        router.route(address(aapl), 1e18, 0);
        uint256 first = btc.balanceOf(alice);
        router.route(address(aapl), 1e18, 0);
        vm.stopPrank();

        assertApproxEqRel(btc.balanceOf(alice) - first, first, 1e15, "the setting did not persist");
    }

    // -----------------------------------------------------------------
    // Custody
    // -----------------------------------------------------------------

    /// @dev The invariant that makes this safe to leave deployed: no balance builds up
    ///      here, so there is nothing to drain and nothing to rescue.
    function test_theRouterKeepsNothing() public {
        _setRoute(alice, address(btc), address(0), 100);

        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        router.route(address(aapl), 1e18, 0);
        vm.stopPrank();

        assertEq(aapl.balanceOf(address(router)), 0, "router kept the input");
        assertEq(btc.balanceOf(address(router)), 0, "router kept the output");
        assertEq(aapl.allowance(address(router), address(adapter)), 0, "left an allowance standing");
    }

    function test_nobodyCanRouteSomebodyElsesTokens() public {
        _setRoute(alice, address(btc), address(0), 100);
        vm.prank(alice);
        aapl.approve(address(router), 10e18);

        // The route is keyed to the caller, so a stranger with no route of their own
        // cannot spend Alice's allowance through it.
        vm.prank(sister);
        vm.expectRevert(abi.encodeWithSelector(DividendRouter.NoRoute.selector, sister));
        router.route(address(aapl), 1e18, 0);
    }

    function test_theOwnerCannotMoveAnyonesTokens() public {
        _setRoute(alice, address(btc), address(0), 100);
        vm.prank(alice);
        aapl.approve(address(router), 10e18);

        // The owner's only power is pointing at a different adapter. There is no
        // sweep, no rescue, and no route-on-behalf-of.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(DividendRouter.NoRoute.selector, admin));
        router.route(address(aapl), 1e18, 0);
        assertEq(aapl.balanceOf(admin), 0);
    }

    // -----------------------------------------------------------------
    // Slippage
    // -----------------------------------------------------------------

    /// @dev A caller who passes no floor is still protected by their saved tolerance.
    function test_theSavedToleranceProtectsACarelessCaller() public {
        _setRoute(alice, address(btc), address(0), 100); // 1%
        vm.prank(admin);
        adapter.setSimulatedSlippageBps(500); // pool moves 5%

        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        vm.expectRevert();
        router.route(address(aapl), 1e18, 0);
        vm.stopPrank();
    }

    /// @dev And a caller with no saved tolerance is still protected by their own floor.
    function test_theCallersOwnFloorProtectsThemWithNoPolicy() public {
        _setRoute(alice, address(btc), address(0), 0);
        vm.prank(admin);
        adapter.setSimulatedSlippageBps(500);

        // Composed through USDG, because the adapter has no AAPL/BTC pair — the same
        // two legs the router runs, so the floor describes the real route.
        uint256 fair = adapter.quote(address(usdg), address(btc), adapter.quote(address(aapl), address(usdg), 1e18));

        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        vm.expectRevert();
        router.route(address(aapl), 1e18, fair);
        vm.stopPrank();
    }

    function test_anAbsurdToleranceIsRefused() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(DividendRouter.SlippageTooHigh.selector, uint16(2_000), uint16(1_000))
        );
        router.setRoute(address(btc), address(0), 2_000);
    }

    // -----------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------

    function test_noRouteMeansNothingHappens() public {
        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        vm.expectRevert(abi.encodeWithSelector(DividendRouter.NoRoute.selector, alice));
        router.route(address(aapl), 1e18, 0);
        vm.stopPrank();
    }

    function test_clearingARouteStopsIt() public {
        _setRoute(alice, address(btc), address(0), 100);
        vm.prank(alice);
        router.clearRoute();

        assertFalse(router.hasRoute(alice));
        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        vm.expectRevert(abi.encodeWithSelector(DividendRouter.NoRoute.selector, alice));
        router.route(address(aapl), 1e18, 0);
        vm.stopPrank();
    }

    function test_previewMatchesWhatTheRouteDoes() public {
        _setRoute(alice, address(btc), sister, 100);
        (address tokenOut, address recipient, uint256 expected, uint256 floor) =
            router.previewRoute(alice, address(aapl), 1e18);

        assertEq(tokenOut, address(btc));
        assertEq(recipient, sister);
        assertGt(expected, 0);
        assertLt(floor, expected, "the floor should sit under the quote");

        vm.startPrank(alice);
        aapl.approve(address(router), 1e18);
        uint256 out = router.route(address(aapl), 1e18, 0);
        vm.stopPrank();
        assertEq(out, expected, "preview disagreed with the fill");
    }

    function test_anUnsetRecipientMeansYourOwnWallet() public {
        _setRoute(alice, address(btc), address(0), 100);
        (, address recipient,) = router.routeOf(alice);
        assertEq(recipient, alice, "an unset recipient must resolve to the holder");
    }
}
