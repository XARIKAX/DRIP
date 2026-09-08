// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {LendingPool} from "../src/LendingPool.sol";
import {DripCore} from "../src/DripCore.sol";
import {Mode} from "../src/interfaces/DripTypes.sol";

/// @notice The credit side. Section 13's economics, checked against its numbers.
/// @dev alice deposits 100 AAPL at 220 USDG = 22,000 collateral throughout. At the
///      40% max LTV that is 8,800 of borrowing power, and the liquidation line sits
///      where collateral x 65% falls to the debt.
contract LendingPoolTest is DripTestBase {
    uint256 internal constant COLLATERAL = 100e18; // 100 AAPL
    uint256 internal constant COLLATERAL_VALUE = 22_000e6;
    uint256 internal constant BORROW_POWER = 8_800e6; // 40% of 22,000

    function setUp() public override {
        super.setUp();
        fundVault(1_000_000e6);
        depositStock(alice, aapl, COLLATERAL);
    }

    function _borrow(address who, uint256 amount) internal {
        vm.prank(who);
        lending.borrow(amount);
    }

    /// @dev Mint a user enough stock to out-collateralise the vault, and deposit it.
    function _giveCollateral(address who, uint256 amount) internal {
        vm.prank(admin);
        aapl.mint(who, amount);
        depositStock(who, aapl, amount);
    }

    // ------------------------------------------------------------------
    // Collateral and borrowing power
    // ------------------------------------------------------------------

    function test_borrowingPowerIsFortyPercentOfCollateral() public view {
        assertEq(lending.collateralValue(alice), COLLATERAL_VALUE, "collateral");
        assertEq(lending.borrowingPower(alice), BORROW_POWER, "power");
        assertEq(lending.availableToBorrow(alice), BORROW_POWER, "available");
    }

    function test_borrowSendsUsdgAndBooksTheLoan() public {
        _borrow(alice, 5_000e6);

        assertEq(usdg.balanceOf(alice), 5_000e6, "alice paid");
        assertEq(lending.debtOf(alice), 5_000e6, "debt");
        assertEq(lending.principalOf(alice), 5_000e6, "principal");
        assertEq(vault.loansOutstanding(), 5_000e6, "vault loan book");
    }

    function test_borrowBeyondMaxLtvReverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(LendingPool.NotEnoughCollateral.selector, BORROW_POWER + 1, BORROW_POWER)
        );
        lending.borrow(BORROW_POWER + 1);
    }

    function test_borrowWithNoCollateralReverts() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LendingPool.NotEnoughCollateral.selector, 1e6, 0));
        lending.borrow(1e6);
    }

    /// @dev Borrowing power is not liquidity. A borrower with collateral to spare
    ///      still cannot draw cash the vault does not have.
    function test_borrowBeyondVaultLiquidityReverts() public {
        _giveCollateral(bob, 100_000e18); // 22,000,000 of power, far past the vault
        uint256 free = vault.freeCash();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(LendingPool.InsufficientLiquidity.selector, free + 1, free));
        lending.borrow(free + 1);
    }

    // ------------------------------------------------------------------
    // Interest
    // ------------------------------------------------------------------

    /// @dev At near-zero utilisation the rate sits at the 2% base.
    function test_rateStartsAtTheBaseRate() public view {
        assertEq(lending.borrowRateBps(), 200, "base rate");
    }

    function test_rateRisesToEightPercentAtTheKink() public {
        // Utilisation is loans / (loans + free cash). Push it to the 80% kink.
        uint256 free = vault.freeCash();
        uint256 target = (free * 8_000) / 10_000;
        _giveCollateral(bob, 100_000e18);
        _borrow(bob, target);

        // At the kink the curve reads base + slope1 = 8%.
        assertApproxEqAbs(lending.borrowRateBps(), 800, 5, "rate at kink");
    }

    function test_interestAccruesOverTime() public {
        _borrow(alice, 1_000e6);
        assertEq(lending.accruedInterestOf(alice), 0, "no interest yet");

        vm.warp(block.timestamp + 365 days);
        lending.accrue();

        // 2% of 1,000 for a year, give or take the compounding step.
        assertApproxEqRel(lending.accruedInterestOf(alice), 20e6, 0.01e18, "one year of interest");
        assertEq(lending.principalOf(alice), 1_000e6, "principal untouched by accrual");
    }

    // ------------------------------------------------------------------
    // Repayment
    // ------------------------------------------------------------------

    function test_repayClearsDebtAndPaysInterestToTheVault() public {
        _borrow(alice, 1_000e6);
        vm.warp(block.timestamp + 365 days);
        lending.accrue();

        uint256 debt = lending.debtOf(alice);
        uint256 feesBefore = vault.totalFeesAccrued();

        vm.startPrank(admin);
        usdg.mint(alice, debt);
        vm.stopPrank();

        vm.startPrank(alice);
        usdg.approve(address(lending), debt);
        lending.repay(alice, type(uint256).max);
        vm.stopPrank();

        assertEq(lending.debtOf(alice), 0, "debt cleared");
        assertEq(lending.principalOf(alice), 0, "principal cleared");
        assertEq(vault.loansOutstanding(), 0, "loan book cleared");
        // Interest becomes LP yield the moment it arrives as cash, and not before.
        assertApproxEqRel(vault.totalFeesAccrued() - feesBefore, 20e6, 0.01e18, "interest to LPs");
    }

    /// @dev A payment smaller than the interest owed must not touch principal.
    function test_partialRepaymentRetiresInterestBeforePrincipal() public {
        _borrow(alice, 1_000e6);
        vm.warp(block.timestamp + 365 days);
        lending.accrue();

        uint256 interest = lending.accruedInterestOf(alice);
        assertGt(interest, 0, "interest accrued");

        vm.startPrank(alice);
        usdg.approve(address(lending), interest / 2);
        lending.repay(alice, interest / 2);
        vm.stopPrank();

        assertEq(lending.principalOf(alice), 1_000e6, "principal untouched");
        assertEq(vault.loansOutstanding(), 1_000e6, "loan book untouched");
    }

    function test_anyoneMayRepayForAnyone() public {
        _borrow(alice, 1_000e6);

        vm.prank(admin);
        usdg.mint(bob, 1_000e6);

        vm.startPrank(bob);
        usdg.approve(address(lending), 1_000e6);
        lending.repay(alice, 1_000e6);
        vm.stopPrank();

        assertEq(lending.debtOf(alice), 0, "alice's debt cleared by bob");
    }

    // ------------------------------------------------------------------
    // Withdrawal is bounded by debt
    // ------------------------------------------------------------------

    function test_withdrawalThatWouldUndercollateraliseReverts() public {
        _borrow(alice, BORROW_POWER);

        // Every share is now backing the loan; none of it can leave.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(LendingPool.WithdrawWouldUndercollateralise.selector, BORROW_POWER, 0)
        );
        core.withdraw(address(aapl), COLLATERAL);
    }

    function test_withdrawalThatKeepsThePositionHealthyIsAllowed() public {
        _borrow(alice, 1_000e6); // needs 2,500 of collateral at 40% LTV

        // Take out half. 11,000 left supports 4,400 of borrowing power against 1,000.
        vm.prank(alice);
        core.withdraw(address(aapl), 50e18);

        assertEq(core.balanceOf(alice, address(aapl)), 50e18, "half remains");
    }

    function test_withdrawalIsUnrestrictedWithNoDebt() public {
        vm.prank(alice);
        core.withdraw(address(aapl), COLLATERAL);
        assertEq(core.balanceOf(alice, address(aapl)), 0, "all out");
    }

    // ------------------------------------------------------------------
    // Dividend servicing — the point of the product
    // ------------------------------------------------------------------

    /// @dev An advance taken at the ex date pays the interest before the wallet.
    function test_cashEarlyAdvancePaysInterestFirst() public {
        _borrow(alice, 5_000e6);
        vm.warp(block.timestamp + 180 days);
        lending.accrue();

        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        uint256 dividendId = declare(aapl, 2e6, 1, 21 days); // 2 USDG per share
        vm.warp(block.timestamp + 2);

        // Read the interest in the block the advance lands in. Servicing quotes what
        // is owed now and pays exactly that; measuring before the warp would be off by
        // the two seconds of interest that accrue in between.
        lending.accrue();
        uint256 interest = lending.accruedInterestOf(alice);
        assertGt(interest, 0, "interest to service");

        uint256 walletBefore = usdg.balanceOf(alice);
        vm.prank(keeper);
        core.activate(dividendId, alice);

        // 100 shares x 2 USDG = 200 gross, less the 1% advance fee = 198 net.
        // The interest comes off that before anything reaches the wallet.
        assertEq(lending.accruedInterestOf(alice), 0, "interest cleared by the dividend");
        assertEq(usdg.balanceOf(alice) - walletBefore, 198e6 - interest, "holder keeps the surplus");
        assertEq(lending.principalOf(alice), 5_000e6, "principal untouched by default");
    }

    /// @dev With the opt-in on, the same dividend keeps going into principal.
    function test_optingInLetsDividendsPayDownPrincipal() public {
        _borrow(alice, 5_000e6);
        vm.prank(alice);
        lending.setAutoRepayPrincipal(true);

        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        uint256 dividendId = declare(aapl, 2e6, 1, 21 days);
        vm.warp(block.timestamp + 2);
        lending.accrue();
        uint256 interest = lending.accruedInterestOf(alice);

        uint256 walletBefore = usdg.balanceOf(alice);
        vm.prank(keeper);
        core.activate(dividendId, alice);

        // The whole 198 net goes at the debt; nothing reaches the wallet. Interest is
        // still retired first, so principal falls by the remainder.
        assertEq(usdg.balanceOf(alice), walletBefore, "nothing to the wallet");
        assertEq(lending.principalOf(alice), 5_000e6 - (198e6 - interest), "principal paid down");
    }

    /// @dev A holder with no debt is unaffected by any of this.
    function test_holderWithNoDebtIsPaidInFull() public {
        vm.prank(alice);
        core.setMode(address(aapl), Mode.CASH_EARLY);

        uint256 dividendId = declare(aapl, 2e6, 1, 21 days);
        vm.warp(block.timestamp + 2);

        uint256 walletBefore = usdg.balanceOf(alice);
        vm.prank(keeper);
        core.activate(dividendId, alice);

        assertEq(usdg.balanceOf(alice) - walletBefore, 198e6, "full net advance");
    }

    // ------------------------------------------------------------------
    // Liquidation
    // ------------------------------------------------------------------

    /// @dev Drop AAPL until alice's 8,800 debt breaches the 65% line.
    function _makeLiquidatable() internal {
        _borrow(alice, BORROW_POWER);
        vm.prank(admin);
        oracle.setPrice(address(aapl), 130e6); // 100 x 130 = 13,000 collateral
    }

    function test_healthyPositionCannotBeLiquidated() public {
        _borrow(alice, 1_000e6);
        vm.prank(admin);
        usdg.mint(bob, 1_000e6);

        vm.startPrank(bob);
        usdg.approve(address(lending), 1_000e6);
        vm.expectRevert(
            abi.encodeWithSelector(LendingPool.PositionHealthy.selector, alice, lending.healthFactorBps(alice))
        );
        lending.liquidate(alice, address(aapl), 100e6);
        vm.stopPrank();
    }

    function test_liquidationRepaysDebtAndSeizesCollateralWithBonus() public {
        _makeLiquidatable();
        assertLt(lending.healthFactorBps(alice), 10_000, "unhealthy");

        uint256 repay = 4_000e6;
        vm.prank(admin);
        usdg.mint(bob, repay);

        uint256 aaplBefore = aapl.balanceOf(bob);
        vm.startPrank(bob);
        usdg.approve(address(lending), repay);
        uint256 seized = lending.liquidate(alice, address(aapl), repay);
        vm.stopPrank();

        // 4,000 USDG at 130 with a 5% bonus = 4,200 / 130 = 32.307... AAPL.
        assertEq(seized, (repay * 10_500 * 1e18) / (130e6 * 10_000), "seize maths");
        assertEq(aapl.balanceOf(bob) - aaplBefore, seized, "liquidator paid in stock");
        assertEq(core.balanceOf(alice, address(aapl)), COLLATERAL - seized, "collateral gone from position");
        assertEq(lending.debtOf(alice), BORROW_POWER - repay, "debt reduced");
    }

    function test_liquidationBeyondTheCloseFactorReverts() public {
        _makeLiquidatable();
        uint256 maxRepay = (lending.debtOf(alice) * 5_000) / 10_000;

        vm.prank(admin);
        usdg.mint(bob, maxRepay + 1e6);

        vm.startPrank(bob);
        usdg.approve(address(lending), maxRepay + 1e6);
        vm.expectRevert(abi.encodeWithSelector(LendingPool.RepayTooLarge.selector, maxRepay + 1e6, maxRepay));
        lending.liquidate(alice, address(aapl), maxRepay + 1e6);
        vm.stopPrank();
    }

    /// @dev An unpriceable asset must stop the liquidation, not price it at zero.
    function test_liquidationRevertsWhenTheOracleHasNoPrice() public {
        _makeLiquidatable();
        vm.prank(admin);
        oracle.setPrice(address(aapl), 0);

        vm.prank(admin);
        usdg.mint(bob, 1_000e6);
        vm.startPrank(bob);
        usdg.approve(address(lending), 1_000e6);
        vm.expectRevert();
        lending.liquidate(alice, address(aapl), 1_000e6);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Vault solvency
    // ------------------------------------------------------------------

    /// @dev The identity in section 9, extended with the loan book.
    function test_vaultAssetsCountLoansOutAtPar() public {
        uint256 before_ = vault.totalAssets();
        _borrow(alice, 5_000e6);

        // Cash left, the loan came back as a receivable: assets are unchanged.
        assertEq(vault.totalAssets(), before_, "lending does not change total assets");
        assertEq(vault.cash() + vault.loansOutstanding(), before_, "cash plus loans");
    }

    function test_utilisationCountsLoansAlongsideAdvances() public {
        assertEq(vault.utilizationBps(), 0, "starts unlent");
        _giveCollateral(bob, 100_000e18);
        _borrow(bob, 100_000e6);
        // 100,000 lent against ~1,000,000 of assets.
        assertApproxEqAbs(vault.utilizationBps(), 1_000, 5, "10 percent utilised");
    }

    /// @dev LPs may not withdraw cash that has been lent out.
    function test_lpCannotWithdrawLentCapital() public {
        _giveCollateral(bob, 100_000e18);
        _borrow(bob, 700_000e6);

        uint256 max = vault.maxWithdraw(lp);
        assertEq(max, vault.freeCash(), "withdrawable is free cash only");
        assertLt(max, 1_000_000e6, "less than deposited");
    }

    // ------------------------------------------------------------------
    // Access control
    // ------------------------------------------------------------------

    function test_onlyCoreMayServiceDebt() public {
        _borrow(alice, 1_000e6);
        vm.prank(bob);
        vm.expectRevert();
        lending.serviceDebt(alice, 1e6);
    }

    function test_onlyLendingPoolMaySeizeCollateral() public {
        vm.prank(bob);
        vm.expectRevert();
        core.seizeCollateral(alice, address(aapl), 1e18, bob);
    }

    function test_riskParametersRefuseAnLtvAtOrAboveTheThreshold() public {
        vm.prank(admin);
        vm.expectRevert(LendingPool.ParameterOutOfRange.selector);
        lending.setRiskParameters(6_500, 6_500, 500, 5_000);
    }
}
