// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {RewardVault} from "../src/RewardVault.sol";

/// @notice The reward token, and the one thing about it that must never be false.
/// @dev Every YT in circulation is a dollar sitting in the vault. A YT the vault
///      cannot honour is not a reward, it is a promise that fails at the moment
///      somebody tries to use it, and it fails for whoever redeems last.
contract RewardVaultTest is Test {
    MockUSDG internal usdg;
    RewardVault internal vault;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        usdg = new MockUSDG(admin);
        vault = new RewardVault(IERC20(address(usdg)), admin);

        vm.startPrank(admin);
        usdg.mint(admin, 1_000e6);
        usdg.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function _fund(uint256 amount) private {
        vm.prank(admin);
        vault.fund(amount);
    }

    function _give(address to, uint256 amount) private {
        address[] memory users = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        users[0] = to;
        amounts[0] = amount;
        vm.prank(admin);
        vault.distribute(users, amounts);
    }

    /// @notice Fund, hand out, redeem, withdraw. The whole reason the contract exists.
    function test_theWholeLoop() public {
        _fund(100e6);
        _give(alice, 40e6);

        assertEq(vault.balanceOf(alice), 40e6, "alice holds her YT");
        assertEq(vault.unallocated(), 60e6, "the rest is still to give away");

        vm.prank(alice);
        vault.redeem(40e6);

        assertEq(usdg.balanceOf(alice), 40e6, "one YT paid one USDG");
        assertEq(vault.balanceOf(alice), 0, "and the YT is gone");
        assertEq(vault.totalRedeemed(), 40e6, "the vault kept count");
    }

    /// @notice The invariant, stated directly: never owe more than is held.
    function test_everyTokenIsBackedByADollar() public {
        _fund(100e6);
        _give(alice, 60e6);
        _give(bob, 40e6);

        assertEq(vault.totalSupply(), usdg.balanceOf(address(vault)), "fully allocated, fully backed");
        assertEq(vault.unallocated(), 0, "nothing left to give");

        // Both can redeem in full, in any order, with nobody left short.
        vm.prank(bob);
        vault.redeem(40e6);
        vm.prank(alice);
        vault.redeem(60e6);

        assertEq(usdg.balanceOf(alice), 60e6);
        assertEq(usdg.balanceOf(bob), 40e6);
        assertEq(vault.totalSupply(), 0);
    }

    /// @dev The distribution that would break it is refused, not truncated.
    function test_cannotHandOutMoreThanWasFunded() public {
        _fund(100e6);

        address[] memory users = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        users[0] = alice;
        amounts[0] = 100e6 + 1;

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.ExceedsBacking.selector, 100e6 + 1, 100e6));
        vault.distribute(users, amounts);
    }

    /// @dev And it counts what is already out, not just this batch.
    function test_theSecondDistributionCannotOverdrawTheFirst() public {
        _fund(100e6);
        _give(alice, 70e6);

        address[] memory users = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        users[0] = bob;
        amounts[0] = 40e6; // 70 + 40 > 100

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RewardVault.ExceedsBacking.selector, 110e6, 100e6));
        vault.distribute(users, amounts);
    }

    /// @notice A pot split by deposit value, which is how the keeper will size it.
    /// @dev $600 and $400 of stock on deposit, $50 to give away: $30 and $20. The
    ///      contract does not compute this, but it has to accept it exactly.
    function test_aProRataSplitOfThePotAddsUp() public {
        _fund(50e6);

        address[] memory users = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        users[0] = alice;
        users[1] = bob;
        amounts[0] = 30e6;
        amounts[1] = 20e6;

        vm.prank(admin);
        vault.distribute(users, amounts);

        assertEq(vault.balanceOf(alice), 30e6);
        assertEq(vault.balanceOf(bob), 20e6);
        assertEq(vault.unallocated(), 0, "the whole pot went out");
    }

    /// @dev One YT should read as one dollar in a wallet, not as dust.
    function test_decimalsMatchUsdg() public view {
        assertEq(vault.decimals(), usdg.decimals(), "YT is denominated like the dollar behind it");
    }

    /// @dev Handing out is privileged; funding is not, and redeeming is nobody's business.
    function test_onlyADistributorHandsOut() public {
        _fund(100e6);
        address[] memory users = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        users[0] = alice;
        amounts[0] = 1e6;

        vm.prank(alice);
        vm.expectRevert();
        vault.distribute(users, amounts);
    }

    /// @notice Redeeming touches nothing but the vault.
    /// @dev The holder's stock stays where it is. Nothing here can reach DripCore, and
    ///      that is the point of it being a separate contract rather than a split
    ///      series' yield token: a reward that could be cashed out of a share would let
    ///      the share be taken twice.
    function test_theVaultHoldsNothingButUsdg() public {
        _fund(100e6);
        _give(alice, 100e6);
        vm.prank(alice);
        vault.redeem(100e6);

        assertEq(usdg.balanceOf(address(vault)), 0, "paid out in full");
        assertEq(vault.totalSupply(), 0, "and owes nothing");
        assertEq(vault.totalFunded(), 100e6, "funding history survives the payout");
    }

    /// @notice Whatever the sequence, the vault never owes more than it holds.
    function testFuzz_neverOwesMoreThanItHolds(uint96 fundAmount, uint96 giveAmount) public {
        uint256 f = bound(fundAmount, 1, 1_000e6);
        _fund(f);

        uint256 g = bound(giveAmount, 0, uint256(f) * 2);
        if (g > 0) {
            address[] memory users = new address[](1);
            uint256[] memory amounts = new uint256[](1);
            users[0] = alice;
            amounts[0] = g;
            vm.prank(admin);
            if (g > f) vm.expectRevert();
            vault.distribute(users, amounts);
        }

        assertLe(vault.totalSupply(), usdg.balanceOf(address(vault)), "backing holds under any sequence");
    }
}
