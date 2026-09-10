// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {PrincipalToken} from "../src/PrincipalToken.sol";
import {YieldToken} from "../src/YieldToken.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";

/// @notice The split, against a stock token that pays dividends the way Robinhood
///         Chain actually pays them: by raising ERC-8056's multiplier while every raw
///         balance stays exactly where it was.
contract SplitVaultTest is Test {
    SplitVault vault;
    MockStockToken stock;

    address admin = address(0xA11CE);
    address alice = address(0xA1);
    address bob = address(0xB0B);

    uint64 maturity;
    uint256 seriesId;
    PrincipalToken pt;
    YieldToken yt;

    uint256 constant ONE = 1e18;

    function setUp() public {
        vm.warp(1_700_000_000);
        maturity = uint64(block.timestamp + 365 days);

        vm.startPrank(admin);
        stock = new MockStockToken("Apple", "AAPL", admin);
        vault = new SplitVault(admin);
        seriesId = vault.createSeries(address(stock), maturity);
        vm.stopPrank();

        (, , address ptAddr, address ytAddr, ) = vault.series(seriesId);
        pt = PrincipalToken(ptAddr);
        yt = YieldToken(ytAddr);

        vm.startPrank(admin);
        stock.mint(alice, 100e18);
        stock.mint(bob, 100e18);
        vm.stopPrank();
    }

    function _split(address who, uint256 amount) internal {
        vm.startPrank(who);
        stock.approve(address(vault), amount);
        vault.split(seriesId, amount);
        vm.stopPrank();
    }

    /// @dev A dividend, as this chain pays one.
    function _dividend(uint256 bps) internal {
        vm.prank(admin);
        stock.accrueDividendBps(bps);
    }

    // -----------------------------------------------------------------
    // The mechanism
    // -----------------------------------------------------------------

    function test_theDividendGoesToYieldNotPrincipal() public {
        _split(alice, 10e18);
        uint256 ptBal = pt.balanceOf(alice);

        _dividend(100); // 1%

        // Principal is still exactly the shares it entered with, so it redeems FEWER
        // raw tokens than went in — the difference is the dividend, and it is YT's.
        uint256 redeems = vault.principalValue(seriesId, ptBal);
        assertLt(redeems, 9.99e18, "principal must not keep the dividend");

        uint256 claimable = vault.claimableYield(seriesId, alice);
        assertGt(claimable, 0, "yield token earned nothing");

        // Together they are the whole deposit back, to the wei.
        assertApproxEqAbs(redeems + claimable, 9.99e18, 2, "split does not reconstitute the deposit");
    }

    function test_principalRedeemsTheSameSharesItEnteredWith() public {
        _split(alice, 10e18);
        uint256 ptBal = pt.balanceOf(alice);
        uint256 sharesAtEntry = (9.99e18 * ONE) / ONE; // multiplier was 1.0

        _dividend(250);
        vm.warp(maturity + 1);

        vm.prank(alice);
        uint256 rawOut = vault.redeemPrincipal(seriesId, ptBal);

        uint256 sharesOut = (rawOut * stock.uiMultiplier()) / ONE;
        assertApproxEqAbs(sharesOut, sharesAtEntry, 2, "principal did not come back whole in shares");
    }

    function test_yieldIsPaidInStock() public {
        _split(alice, 10e18);
        _dividend(100);

        uint256 before = stock.balanceOf(alice);
        vm.prank(alice);
        uint256 got = vault.claimYield(seriesId);

        assertGt(got, 0);
        assertEq(stock.balanceOf(alice) - before, got, "claim did not pay the stock");
    }

    /// @dev The bug a flat pro-rata split of a pot would have: Bob arrives after the
    ///      dividend and must not be paid for growth that happened before he held.
    function test_aLateEntrantEarnsNothingFromEarlierGrowth() public {
        _split(alice, 10e18);
        _dividend(100);
        _split(bob, 10e18);

        assertEq(vault.claimableYield(seriesId, bob), 0, "late entrant was paid for the past");
        assertGt(vault.claimableYield(seriesId, alice), 0, "early holder was not paid");

        // From here they earn together, and only Alice carries the first dividend.
        uint256 aliceBefore = vault.claimableYield(seriesId, alice);
        _dividend(100);
        assertGt(vault.claimableYield(seriesId, bob), 0);
        assertGt(vault.claimableYield(seriesId, alice), aliceBefore);
        assertGt(
            vault.claimableYield(seriesId, alice),
            vault.claimableYield(seriesId, bob),
            "the earlier holder should be ahead by the first dividend"
        );
    }

    function test_aTransferMovesTheFutureAndNotThePast() public {
        _split(alice, 10e18);
        _dividend(100);

        uint256 aliceEarned = vault.claimableYield(seriesId, alice);

        uint256 all = yt.balanceOf(alice);
        vm.prank(alice);
        yt.transfer(bob, all);

        assertApproxEqAbs(vault.claimableYield(seriesId, alice), aliceEarned, 2, "sold the yield already earned");
        assertEq(vault.claimableYield(seriesId, bob), 0, "buyer was credited history they did not hold");

        _dividend(100);
        assertGt(vault.claimableYield(seriesId, bob), 0, "buyer earns nothing going forward");
    }

    /// @dev Freezing is a duty, not an accident. The keeper calls freezeSeries at
    ///      maturity; every payout path also freezes, so a holder who turns up late
    ///      cannot be short-changed. The window this closes is real: between maturity
    ///      and the first touch, a dividend would otherwise accrue to YT out of PT's
    ///      principal.
    function test_yieldStopsOnceTheSeriesIsFrozen() public {
        _split(alice, 10e18);
        _dividend(100);
        vm.warp(maturity + 1);

        vault.freezeSeries(seriesId);
        uint256 atMaturity = vault.claimableYield(seriesId, alice);

        _dividend(500); // long after the series ended
        assertApproxEqAbs(vault.claimableYield(seriesId, alice), atMaturity, 2, "yield kept accruing past maturity");
    }

    function test_freezingIsPermissionlessAndIdempotent() public {
        _split(alice, 10e18);
        vm.warp(maturity + 1);

        vm.prank(bob);
        vault.freezeSeries(seriesId);
        uint256 first = yt.frozenIndex();
        assertGt(first, 0, "freeze did not record the index");

        _dividend(500);
        vm.prank(bob);
        vault.freezeSeries(seriesId);
        assertEq(yt.frozenIndex(), first, "a second freeze moved the index");
    }

    /// @dev A payout path freezes on its own, so nobody depends on the keeper.
    function test_redeemingFreezesTheSeriesItself() public {
        _split(alice, 10e18);
        _dividend(100);
        vm.warp(maturity + 1);

        uint256 allPt = pt.balanceOf(alice);
        vm.prank(alice);
        vault.redeemPrincipal(seriesId, allPt);
        assertGt(yt.frozenIndex(), 0, "redeem left the clock running");
    }

    function test_mergeReturnsTheStockAndKeepsWhatWasEarned() public {
        _split(alice, 10e18);
        _dividend(100);
        uint256 earned = vault.claimableYield(seriesId, alice);

        // Merge takes PT, the scarcer leg: 9.99 PT is 9.99 shares is 9.891 raw at
        // 1.01. Asking for `raw * M` PT would demand more than the split ever minted.
        uint256 allPt = pt.balanceOf(alice);
        uint256 expectRaw = vault.principalValue(seriesId, allPt);

        uint256 before = stock.balanceOf(alice);
        vm.prank(alice);
        vault.merge(seriesId, allPt);

        assertApproxEqAbs(stock.balanceOf(alice) - before, expectRaw, 2, "merge did not return the principal");
        assertApproxEqAbs(vault.claimableYield(seriesId, alice), earned, 2, "merge confiscated earned yield");

        // The dividend stays behind as YT, exactly as it should.
        assertGt(yt.balanceOf(alice), 0, "the yield leg was retired with the principal");
    }

    function test_aTokenWithNoMultiplierCannotBeListed() public {
        vm.startPrank(admin);
        // A plain ERC20 has no uiMultiplier(); listing it would hand every share of
        // accretion to PT and make YT worthless, silently.
        vm.expectRevert();
        vault.createSeries(address(0xDEAD), uint64(block.timestamp + 1 days));
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // The invariant
    // -----------------------------------------------------------------

    /// @notice Whatever the multiplier does and whoever entered when, principal plus
    ///         yield never claims more stock than the vault is holding.
    function testFuzz_principalPlusYieldNeverExceedsBacking(
        uint96 aliceIn,
        uint96 bobIn,
        uint16 div1,
        uint16 div2
    ) public {
        aliceIn = uint96(bound(aliceIn, 1e15, 50e18));
        bobIn = uint96(bound(bobIn, 1e15, 50e18));
        div1 = uint16(bound(div1, 0, 2_000));
        div2 = uint16(bound(div2, 0, 2_000));

        _split(alice, aliceIn);
        if (div1 > 0) _dividend(div1);
        _split(bob, bobIn);
        if (div2 > 0) _dividend(div2);

        uint256 m = stock.uiMultiplier();
        uint256 owedToPrincipal = (pt.totalSupply() * ONE) / m;
        uint256 owedToYield =
            vault.claimableYield(seriesId, alice) + vault.claimableYield(seriesId, bob);

        uint256 held = stock.balanceOf(address(vault)) - vault.feesOwed(address(stock));

        // Rounding is allowed to leave dust behind, never to promise what is not there.
        assertLe(owedToPrincipal + owedToYield, held + 4, "claims exceed the stock held");
    }
}
