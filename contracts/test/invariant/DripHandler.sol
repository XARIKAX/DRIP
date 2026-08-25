// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDG} from "../../src/mocks/MockUSDG.sol";
import {MockStockToken} from "../../src/mocks/MockStockToken.sol";
import {DividendRegistry} from "../../src/DividendRegistry.sol";
import {AdvanceVault} from "../../src/AdvanceVault.sol";
import {DripCore} from "../../src/DripCore.sol";
import {StreamEngine} from "../../src/StreamEngine.sol";
import {IStreamEngine} from "../../src/interfaces/IStreamEngine.sol";
import {Mode, Dividend, DividendStatus} from "../../src/interfaces/DripTypes.sol";

/// @title DripHandler
/// @notice Drives the protocol through random but legal sequences for the invariant runs.
/// @dev Everything is bounded rather than assumed, so runs spend their calls inside the
///      state space that matters instead of bouncing off input validation. Reverts are
///      tolerated by config: a run that reverts is a run that found a guard doing its job.
contract DripHandler is Test {
    MockUSDG public usdg;
    MockStockToken[2] public tokens;
    DividendRegistry public registry;
    AdvanceVault public vault;
    DripCore public core;
    StreamEngine public stream;

    address[3] public actors;
    address public lp;

    uint256[] public declaredIds;

    /// @notice Sum of every USDG amount ever pulled out of a stream. Bounds checked by the invariant.
    uint256 public ghostStreamClaimed;

    constructor(
        MockUSDG usdg_,
        MockStockToken t0,
        MockStockToken t1,
        DividendRegistry registry_,
        AdvanceVault vault_,
        DripCore core_,
        StreamEngine stream_,
        address[3] memory actors_,
        address lp_
    ) {
        usdg = usdg_;
        tokens = [t0, t1];
        registry = registry_;
        vault = vault_;
        core = core_;
        stream = stream_;
        actors = actors_;
        lp = lp_;
    }

    // ------------------------------------------------------------------
    // LP side
    // ------------------------------------------------------------------

    function lpDeposit(uint256 amount) public {
        uint256 amt = bound(amount, 1e6, 500_000e6);
        if (usdg.balanceOf(lp) < amt) return;
        vm.startPrank(lp);
        usdg.approve(address(vault), amt);
        vault.deposit(amt, lp);
        vm.stopPrank();
    }

    function lpWithdraw(uint256 amount) public {
        uint256 max = vault.maxWithdraw(lp);
        if (max == 0) return;
        uint256 amt = bound(amount, 1, max);
        if (amt > max / 2) amt = max / 2;
        if (amt == 0) return;
        vm.prank(lp);
        vault.withdraw(amt, lp, lp);
    }

    // ------------------------------------------------------------------
    // Holder side
    // ------------------------------------------------------------------

    function holderDeposit(uint256 actorSeed, uint256 tokenSeed, uint256 amount) public {
        address actor = _actor(actorSeed);
        MockStockToken token = _token(tokenSeed);
        uint256 amt = bound(amount, 1e15, 500e18);
        if (token.balanceOf(actor) < amt) return;
        vm.startPrank(actor);
        token.approve(address(core), amt);
        core.deposit(address(token), amt);
        vm.stopPrank();
    }

    function holderWithdraw(uint256 actorSeed, uint256 tokenSeed, uint256 amount) public {
        address actor = _actor(actorSeed);
        MockStockToken token = _token(tokenSeed);
        uint256 held = core.balanceOf(actor, address(token));
        if (held == 0) return;
        uint256 amt = bound(amount, 1, held);
        vm.prank(actor);
        core.withdraw(address(token), amt);
    }

    function holderSetMode(uint256 actorSeed, uint256 tokenSeed, uint256 modeSeed) public {
        address actor = _actor(actorSeed);
        MockStockToken token = _token(tokenSeed);
        Mode mode = Mode(bound(modeSeed, 0, 2));
        vm.prank(actor);
        core.setMode(address(token), mode);
    }

    // ------------------------------------------------------------------
    // Dividend lifecycle
    // ------------------------------------------------------------------

    function declare(uint256 tokenSeed, uint256 perToken, uint256 exIn, uint256 window) public {
        MockStockToken token = _token(tokenSeed);
        uint256 amt = bound(perToken, 1e4, 3e6);
        uint64 ex = uint64(block.timestamp + bound(exIn, 0, 12 hours));
        uint64 pay = ex + uint64(bound(window, 1 days, 30 days));
        uint256 id = registry.declareDividend(address(token), amt, ex, pay);
        declaredIds.push(id);
    }

    /// @notice Successful activations. Asserted non zero so the runs can never go vacuous.
    uint256 public ghostActivations;

    /// @notice Route a dividend for whichever holder is currently eligible.
    /// @dev Scans from a fuzzed offset instead of picking one blind pair. A blind pick
    ///      needs the actor, the dividend, the token and the clock to line up by luck,
    ///      which almost never happens inside one run, and the suite then passes green
    ///      having proved nothing. Scanning keeps the ordering random while guaranteeing
    ///      the run makes progress whenever progress is legal.
    function activate(uint256 actorSeed, uint256 idSeed) public {
        uint256 n = declaredIds.length;
        if (n == 0) return;
        uint256 idOffset = bound(idSeed, 0, n - 1);
        uint256 actorOffset = bound(actorSeed, 0, 2);

        for (uint256 i = 0; i < n; ++i) {
            uint256 id = declaredIds[(idOffset + i) % n];
            Dividend memory d = registry.getDividend(id);
            if (d.status != DividendStatus.DECLARED) continue;
            if (block.timestamp < d.exDate || block.timestamp >= d.payDate) continue;

            for (uint256 a = 0; a < 3; ++a) {
                address actor = actors[(actorOffset + a) % 3];
                if (core.entitlementOf(id, actor).activated) continue;
                uint256 gross = core.pendingEntitlement(id, actor);
                if (gross == 0) continue;
                // Do not spend fuzz calls on advances the vault is allowed to refuse.
                // Those guards have their own unit tests; here we want depth.
                if (!_vaultCanFront(gross)) continue;

                try core.activate(id, actor) {
                    ghostActivations++;
                } catch {}
                return;
            }
        }
    }

    /// @dev Mirrors AdvanceVault's two admission checks so the handler only attempts
    ///      advances that should succeed.
    function _vaultCanFront(uint256 gross) private view returns (bool) {
        uint256 net = gross - (gross * vault.advanceFeeBps()) / 10_000;
        if (vault.cash() < vault.obligations() + net) return false;
        uint256 receivablesAfter = vault.receivables() + gross;
        uint256 assetsAfter = vault.cash() + receivablesAfter - (vault.obligations() + net);
        if (assetsAfter == 0) return false;
        return (receivablesAfter * 10_000) / assetsAfter <= vault.maxUtilizationBps();
    }

    /// @notice Pull whatever has accrued for whichever holder has something to pull.
    function claimStream(uint256 actorSeed, uint256 streamSeed) public {
        uint256 actorOffset = bound(actorSeed, 0, 2);
        for (uint256 a = 0; a < 3; ++a) {
            address actor = actors[(actorOffset + a) % 3];
            uint256[] memory ids = stream.activeStreamsOf(actor);
            if (ids.length == 0) continue;
            uint256 offset = bound(streamSeed, 0, ids.length - 1);
            for (uint256 i = 0; i < ids.length; ++i) {
                uint256 id = ids[(offset + i) % ids.length];
                if (stream.claimable(id) == 0) continue;
                vm.prank(actor);
                try stream.claim(id) returns (uint256 got) {
                    ghostStreamClaimed += got;
                } catch {}
                return;
            }
        }
    }

    /// @notice Pay whichever declared dividend is settleable.
    function settle(uint256 idSeed) public {
        uint256 n = declaredIds.length;
        if (n == 0) return;
        uint256 offset = bound(idSeed, 0, n - 1);
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = declaredIds[(offset + i) % n];
            if (registry.statusOf(id) != DividendStatus.DECLARED) continue;
            uint256 owed = core.totalEntitlementFor(id);
            if (owed == 0 || usdg.balanceOf(address(this)) < owed) continue;
            usdg.approve(address(core), owed);
            try core.settleDividend(id) {} catch {}
            return;
        }
    }

    /// @notice Take the slow lane for whichever holder still can.
    function claimSettled(uint256 actorSeed, uint256 idSeed) public {
        uint256 n = declaredIds.length;
        if (n == 0) return;
        uint256 offset = bound(idSeed, 0, n - 1);
        uint256 actorOffset = bound(actorSeed, 0, 2);
        for (uint256 i = 0; i < n; ++i) {
            uint256 id = declaredIds[(offset + i) % n];
            if (registry.statusOf(id) != DividendStatus.SETTLED) continue;
            for (uint256 a = 0; a < 3; ++a) {
                address actor = actors[(actorOffset + a) % 3];
                vm.prank(actor);
                try core.claimSettled(id) {
                    return;
                } catch {}
            }
        }
    }

    function warp(uint256 secs) public {
        vm.warp(block.timestamp + bound(secs, 1 hours, 5 days));
    }

    // ------------------------------------------------------------------
    // Views for the invariants
    // ------------------------------------------------------------------

    function actorCount() external pure returns (uint256) {
        return 3;
    }

    function tokenCount() external pure returns (uint256) {
        return 2;
    }

    function declaredCount() external view returns (uint256) {
        return declaredIds.length;
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[bound(seed, 0, 2)];
    }

    function _token(uint256 seed) private view returns (MockStockToken) {
        return tokens[bound(seed, 0, 1)];
    }
}
