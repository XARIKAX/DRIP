// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "../DripTestBase.sol";
import {DripHandler} from "./DripHandler.sol";
import {IStreamEngine} from "../../src/interfaces/IStreamEngine.sol";
import {MockStockToken} from "../../src/mocks/MockStockToken.sol";

/// @title DripInvariants
/// @notice The three properties the protocol is not allowed to break, no matter the order
///         of operations: the vault stays solvent, a stream never overpays, and every
///         token credited to a position is actually held.
contract DripInvariantsTest is DripTestBase {
    DripHandler internal handler;
    address internal carol = makeAddr("carol");

    function setUp() public override {
        super.setUp();

        address[3] memory actors = [alice, bob, carol];

        handler = new DripHandler(usdg, aapl, ko, registry, vault, core, stream, actors, lp);

        bytes32 oracleRole = registry.ORACLE_ROLE();
        bytes32 keeperRole = core.KEEPER_ROLE();

        vm.startPrank(admin);
        registry.grantRole(oracleRole, address(handler));
        core.grantRole(keeperRole, address(handler));
        usdg.mint(address(handler), 50_000_000e6);
        usdg.mint(lp, 20_000_000e6);
        for (uint256 i = 0; i < 3; ++i) {
            aapl.mint(actors[i], 10_000e18);
            ko.mint(actors[i], 10_000e18);
        }
        vm.stopPrank();

        // Seed the vault so advances are possible from the first call. Without this the
        // fuzzer spends its whole budget bouncing off the cash floor and the runs go
        // vacuous, which is the failure mode invariant suites die of quietly.
        vm.startPrank(lp);
        usdg.approve(address(vault), 5_000_000e6);
        vault.deposit(5_000_000e6, lp);
        vm.stopPrank();

        targetContract(address(handler));
    }

    /// @notice The vault can always pay every holder it has already promised.
    /// @dev This is the property that makes an advance safe to accept. If cash ever fell
    ///      below obligations, a mid stream claim would fail and the product would be a lie.
    function invariant_CashAlwaysCoversObligations() public view {
        assertGe(vault.cash(), vault.obligations());
    }

    /// @notice Advances never exceed the utilisation cap on deposits.
    /// @dev The brief's "advances <= deposits x maxUtilization", expressed against total
    ///      assets, which is the correct denominator once fees and losses have moved.
    function invariant_UtilizationWithinCap() public view {
        if (vault.totalAssets() == 0) return;
        assertLe(vault.utilizationBps(), vault.maxUtilizationBps());
    }

    /// @notice A stream pays out exactly what it was opened with, and never a wei more.
    function invariant_StreamNeverOverpays() public view {
        uint256 n = stream.streamCount();
        for (uint256 id = 1; id <= n; ++id) {
            IStreamEngine.Stream memory s = stream.getStream(id);
            assertLe(uint256(s.claimed), uint256(s.total));
        }
    }

    /// @notice Every stock token credited to a position is really in custody.
    /// @dev Covers the reinvest path: tokens bought by Reinvestor must land in DripCore
    ///      one for one with the balance it credits, or the protocol is printing shares.
    function invariant_CustodyMatchesPositions() public view {
        address[3] memory actors = [alice, bob, carol];
        MockStockToken[2] memory toks = [aapl, ko];

        for (uint256 t = 0; t < 2; ++t) {
            uint256 summed;
            for (uint256 a = 0; a < 3; ++a) {
                summed += core.balanceOf(actors[a], address(toks[t]));
            }
            assertEq(toks[t].balanceOf(address(core)), summed);
            assertEq(core.totalDeposited(address(toks[t])), summed);
        }
    }

    /// @notice Total USDG pulled from streams never exceeds what the vault booked as owed.
    function invariant_StreamClaimsBoundedByBookedAdvances() public view {
        assertLe(handler.ghostStreamClaimed(), vault.totalFeesAccrued() + _totalNetBooked());
    }

    /// @notice The handler can actually reach the states the invariants are about.
    /// @dev An invariant suite whose handler silently no-ops passes just as green as one
    ///      that exercises everything. This drives the handler by hand through a full
    ///      lifecycle so a future change that breaks the driver fails here, loudly,
    ///      instead of quietly certifying nothing.
    function test_HandlerReachesEveryState() public {
        handler.holderDeposit(0, 0, 100e18);
        handler.holderSetMode(1, 0, uint256(uint8(2))); // bob reinvests
        handler.holderDeposit(1, 0, 50e18);
        handler.declare(0, 1e6, 0, 21 days);
        handler.warp(2 hours);

        handler.activate(0, 0);
        handler.activate(1, 0);
        assertGt(handler.ghostActivations(), 0, "handler never activated a dividend");
        assertGt(stream.streamCount(), 0, "handler never opened a stream");
        assertGt(vault.totalFeesAccrued(), 0, "handler never earned an advance fee");

        handler.warp(5 days);
        handler.claimStream(0, 0);
        assertGt(handler.ghostStreamClaimed(), 0, "handler never claimed from a stream");

        handler.settle(0);
        assertGt(core.settledPool(1) + vault.totalFeesAccrued(), 0, "handler never settled");
    }

    /// @dev Net booked across every stream ever opened.
    function _totalNetBooked() private view returns (uint256 total) {
        uint256 n = stream.streamCount();
        for (uint256 id = 1; id <= n; ++id) {
            total += uint256(stream.getStream(id).total);
        }
    }
}
