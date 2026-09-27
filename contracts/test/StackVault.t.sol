// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StackVault} from "../src/StackVault.sol";
import {StackToken} from "../src/StackToken.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";

/// @notice A basket that holds a stock and two memecoins, which is the point: units
///         need no price, so a Stack can hold something no oracle has ever heard of.
contract StackVaultTest is Test {
    StackVault vault;
    MockStockToken nvda;
    MockStockToken pons;
    MockUSDG cash; // six decimals, to prove the recipe does not assume eighteen

    address admin = address(0xA11CE);
    address alice = address(0xA1);

    uint256 stackId;
    StackToken share;

    uint256 constant ONE = 1e18;

    function setUp() public {
        vm.startPrank(admin);
        nvda = new MockStockToken("Nvidia", "NVDA", admin);
        pons = new MockStockToken("Pons", "PONS", admin);
        cash = new MockUSDG(admin);

        vault = new StackVault(admin);

        address[] memory c = new address[](3);
        c[0] = address(nvda);
        c[1] = address(pons);
        c[2] = address(cash);

        uint256[] memory u = new uint256[](3);
        u[0] = 0.5e18; // half an NVDA per share
        u[1] = 10e18; // ten PONS
        u[2] = 25e6; // twenty-five dollars of a six decimal token

        stackId = vault.createStack("Robot Economy", "ROBOT", c, u);
        (address token,,,,) = vault.stackOf(stackId);
        share = StackToken(token);

        nvda.mint(alice, 100e18);
        pons.mint(alice, 10_000e18);
        cash.mint(alice, 100_000e6);
        vm.stopPrank();

        vm.startPrank(alice);
        nvda.approve(address(vault), type(uint256).max);
        pons.approve(address(vault), type(uint256).max);
        cash.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // The basket
    // -----------------------------------------------------------------

    function test_mintingTakesTheWholeRecipe() public {
        vm.prank(alice);
        vault.mint(stackId, 2e18); // two shares

        assertEq(share.balanceOf(alice), 2e18, "shares not minted");
        assertEq(nvda.balanceOf(address(vault)), 1e18, "wrong NVDA taken");
        assertEq(pons.balanceOf(address(vault)), 20e18, "wrong PONS taken");
        assertEq(cash.balanceOf(address(vault)), 50e6, "wrong cash taken");
    }

    function test_redeemingGivesTheWholeRecipeBack() public {
        vm.startPrank(alice);
        vault.mint(stackId, 2e18);

        uint256 nvdaBefore = nvda.balanceOf(alice);
        uint256 ponsBefore = pons.balanceOf(alice);
        uint256 cashBefore = cash.balanceOf(alice);

        vault.redeem(stackId, 2e18);
        vm.stopPrank();

        assertEq(share.balanceOf(alice), 0, "shares not burned");
        assertEq(nvda.balanceOf(alice) - nvdaBefore, 1e18);
        assertEq(pons.balanceOf(alice) - ponsBefore, 20e18);
        assertEq(cash.balanceOf(alice) - cashBefore, 50e6);
    }

    function test_aSixDecimalConstituentIsHeldCorrectly() public {
        vm.prank(alice);
        vault.mint(stackId, 1e18);
        // 25e6 is $25 of a six decimal token, not 25 wei and not 25e18.
        assertEq(cash.balanceOf(address(vault)), 25e6, "decimals were assumed");
    }

    function test_previewMatchesWhatMintingCosts() public {
        (address[] memory c, uint256[] memory amounts) = vault.previewMint(stackId, 3e18);
        assertEq(c.length, 3);

        uint256 before = nvda.balanceOf(alice);
        vm.prank(alice);
        vault.mint(stackId, 3e18);
        assertEq(before - nvda.balanceOf(alice), amounts[0], "preview disagreed with the fill");
    }

    // -----------------------------------------------------------------
    // Backing
    // -----------------------------------------------------------------

    /// @dev The rule that keeps the last redeemer whole: every rounding error lands in
    ///      the vault's favour, so the basket is never short of what the supply claims.
    function testFuzz_theVaultIsNeverShortOfWhatItOwes(uint96 a, uint96 b) public {
        a = uint96(bound(a, 1e12, 10e18));
        b = uint96(bound(b, 1e12, 10e18));

        vm.startPrank(alice);
        vault.mint(stackId, a);
        vault.mint(stackId, b);

        (, uint256[] memory owed) = vault.previewRedeem(stackId, share.balanceOf(alice));
        vm.stopPrank();

        assertGe(nvda.balanceOf(address(vault)), owed[0], "short on NVDA");
        assertGe(pons.balanceOf(address(vault)), owed[1], "short on PONS");
        assertGe(cash.balanceOf(address(vault)), owed[2], "short on cash");
    }

    /// @dev Two Stacks sharing a constituent must not share its backing.
    function test_oneStacksBackingCannotPayAnothersRedemption() public {
        vm.startPrank(admin);
        address[] memory c = new address[](1);
        c[0] = address(nvda);
        uint256[] memory u = new uint256[](1);
        u[0] = 1e18;
        uint256 other = vault.createStack("Just Nvidia", "JNV", c, u);
        vm.stopPrank();

        vm.startPrank(alice);
        vault.mint(stackId, 1e18); // 0.5 NVDA into the first Stack
        vault.mint(other, 1e18); // 1 NVDA into the second
        vm.stopPrank();

        assertEq(vault.heldOf(stackId, address(nvda)), 0.5e18);
        assertEq(vault.heldOf(other, address(nvda)), 1e18);

        // Redeeming the second cannot reach the first's half.
        vm.prank(alice);
        vault.redeem(other, 1e18);
        assertEq(vault.heldOf(stackId, address(nvda)), 0.5e18, "the other Stack's backing was raided");
        assertEq(nvda.balanceOf(address(vault)), 0.5e18);
    }

    // -----------------------------------------------------------------
    // Recipes that must be refused
    // -----------------------------------------------------------------

    function test_aDuplicateConstituentIsRefused() public {
        address[] memory c = new address[](2);
        c[0] = address(nvda);
        c[1] = address(nvda);
        uint256[] memory u = new uint256[](2);
        u[0] = 1e18;
        u[1] = 1e18;

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(StackVault.DuplicateConstituent.selector, address(nvda)));
        vault.createStack("Double", "DBL", c, u);
    }

    /// @dev It would mint fine and revert on the first redemption, stranding everything
    ///      deposited beside it.
    function test_somethingThatIsNotATokenIsRefused() public {
        address[] memory c = new address[](1);
        c[0] = address(0xDEAD);
        uint256[] memory u = new uint256[](1);
        u[0] = 1e18;

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(StackVault.NotAToken.selector, address(0xDEAD)));
        vault.createStack("Ghost", "GHST", c, u);
    }

    function test_aZeroUnitConstituentIsRefused() public {
        address[] memory c = new address[](1);
        c[0] = address(nvda);
        uint256[] memory u = new uint256[](1);
        u[0] = 0;

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(StackVault.ZeroUnits.selector, address(nvda)));
        vault.createStack("Empty", "MT", c, u);
    }

    function test_sevenConstituentsAreRefused() public {
        address[] memory c = new address[](7);
        uint256[] memory u = new uint256[](7);
        for (uint256 i = 0; i < 7; ++i) {
            c[i] = address(uint160(0x1000 + i));
            u[i] = 1e18;
        }
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(StackVault.TooManyConstituents.selector, 7, 6));
        vault.createStack("Too Many", "MANY", c, u);
    }

    // -----------------------------------------------------------------
    // The freeze
    // -----------------------------------------------------------------

    /// @dev One way and deliberately partial. An admin who could also block redemption
    ///      could strand somebody's basket.
    function test_freezingStopsMintingAndNeverRedeeming() public {
        vm.prank(alice);
        vault.mint(stackId, 1e18);

        vm.prank(admin);
        vault.freezeStack(stackId);

        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(StackVault.StackIsFrozen.selector, stackId));
        vault.mint(stackId, 1e18);

        // The exit stays open.
        vault.redeem(stackId, 1e18);
        vm.stopPrank();
        assertEq(share.balanceOf(alice), 0, "could not get out of a frozen Stack");
    }

    function test_onlyTheVaultCanMintShares() public {
        vm.prank(alice);
        vm.expectRevert(StackToken.NotVault.selector);
        share.mint(alice, 1e18);
    }
}
