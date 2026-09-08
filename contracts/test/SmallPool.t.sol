// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {LendingPool} from "../src/LendingPool.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {Mode} from "../src/interfaces/DripTypes.sol";

/// @notice The whole protocol on a pool of 50 USDG.
/// @dev A first mainnet deployment is funded with a token amount, not a round
///      hypothetical, and the interesting question is whether anything has an implicit
///      floor below which it stops working: a minimum deposit, a fee that rounds to
///      zero, a utilisation formula that divides by a number too small to survive.
///
///      It does not. What a small pool bounds is capacity, and this file pins the two
///      limits that follow from the parameters rather than from any code:
///
///        max gross advance  = maxUtilization x pool, adjusted for the fee staying in
///        max total borrow   = maxUtilization x pool
///
///      Both scale linearly, so deepening the pool later moves them and nothing else.
contract SmallPoolTest is DripTestBase {
    /// @notice What the first mainnet pool is funded with.
    uint256 internal constant POOL = 50e6;

    function setUp() public override {
        super.setUp();
        fundVault(POOL);
    }

    /// @dev The LP's shares are worth what they put in, on a pool this size too.
    function test_firstDepositIsNotDilutedByTheVirtualShares() public view {
        assertEq(vault.totalAssets(), POOL, "pool holds what was funded");
        assertEq(vault.maxWithdraw(lp), POOL, "LP can take it all back out");
        assertGt(vault.balanceOf(lp), 0, "shares minted");
    }

    /// @notice The full income loop: deposit, go ex, get paid early, settle.
    function test_earlyAdvanceWorksAtFiftyUsdg() public {
        depositStock(alice, aapl, 10e18); // 10 AAPL, $2,200
        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        // $0.26 a share on 10 shares is $2.60 gross, $2.574 net of the 1% fee.
        uint256 id = declare(aapl, 0.26e6, 1, 21 days);
        vm.warp(block.timestamp + 2);

        uint256 before_ = usdg.balanceOf(alice);
        vm.prank(keeper);
        core.activate(id, alice);

        assertEq(usdg.balanceOf(alice) - before_, 2.574e6, "paid early, net of the fee");
        assertEq(vault.totalFeesAccrued(), 0.026e6, "the 1 percent fee did not round away");

        // Pay date: the issuer settles and the vault's receivable comes back.
        vm.warp(block.timestamp + 22 days);
        vm.startPrank(keeper);
        usdg.approve(address(core), 2.6e6);
        core.settleDividend(id);
        vm.stopPrank();

        assertEq(vault.receivables(), 0, "receivable retired");
        assertEq(vault.totalAssets(), POOL + 0.026e6, "LPs keep the fee");
    }

    /// @notice The credit loop, and the dividend that services it.
    function test_borrowAndDividendServicingWorkAtFiftyUsdg() public {
        depositStock(alice, aapl, 10e18); // $2,200 of collateral, $880 of power
        vm.prank(alice);
        lending.borrow(30e6); // bounded by the pool, not by the collateral

        assertEq(usdg.balanceOf(alice), 30e6, "drawn");
        assertEq(vault.loansOutstanding(), 30e6, "on the vault's book");

        vm.warp(block.timestamp + 180 days);
        lending.accrue();
        uint256 interest = lending.accruedInterestOf(alice);
        assertGt(interest, 0, "interest accrued on a small loan");

        // A dividend arrives and goes at the interest before the wallet.
        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);
        uint256 id = declare(aapl, 0.26e6, 1, 21 days);
        vm.warp(block.timestamp + 2);
        lending.accrue();
        interest = lending.accruedInterestOf(alice);

        uint256 walletBefore = usdg.balanceOf(alice);
        vm.prank(keeper);
        core.activate(id, alice);

        // Not exactly zero: retiring scaled debt rounds down, deliberately in the
        // vault's favour, so servicing lands on dust rather than on nothing. One unit
        // of a six decimal token is $0.000001.
        assertLe(lending.accruedInterestOf(alice), 2, "interest serviced down to dust");
        assertEq(usdg.balanceOf(alice) - walletBefore, 2.574e6 - interest, "holder keeps the rest");
    }

    /// @notice Capacity, not correctness: what a 50 USDG pool can and cannot front.
    /// @dev The utilisation cap is the binding limit, and it bites well before the
    ///      cash floor does. Deepening the pool moves both proportionally.
    function test_theUtilisationCapBoundsWhatASmallPoolCanFront() public {
        // Borrowing stops at 80% of the pool however much collateral is pledged.
        _giveAlice(1_000e18); // $220,000 of stock, $88,000 of borrowing power
        vm.prank(alice);
        lending.borrow(40e6);
        assertEq(vault.utilizationBps(), 8_000, "at the cap");

        vm.prank(alice);
        vm.expectRevert();
        lending.borrow(1e6); // one more USDG breaches it

        assertEq(lending.availableToBorrow(alice), 0, "the app shows nothing left");
    }

    /// @dev A dividend larger than the pool can front is refused, not half paid.
    function test_anAdvanceLargerThanThePoolIsRefused() public {
        _giveAlice(1_000e18);
        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        // $0.26 on 1,000 shares is $260 gross against a $50 pool.
        uint256 id = declare(aapl, 0.26e6, 1, 21 days);
        vm.warp(block.timestamp + 2);

        vm.prank(keeper);
        vm.expectRevert();
        core.activate(id, alice);

        // Nothing was half done: the holder still owns the entitlement and can claim
        // it in full at the pay date instead.
        assertEq(vault.receivables(), 0, "no receivable booked");
        assertEq(vault.totalAssets(), POOL, "pool untouched");
    }

    function _giveAlice(uint256 amount) private {
        vm.prank(admin);
        aapl.mint(alice, amount);
        depositStock(alice, aapl, amount);
    }
}
