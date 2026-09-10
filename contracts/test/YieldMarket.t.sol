// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {YieldMarket} from "../src/YieldMarket.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {ISplitVault} from "../src/interfaces/ISplitVault.sol";
import {YieldToken} from "../src/YieldToken.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Selling the dividend before it has been earned. The market posts a price
///         and wears the risk of posting it wrong; the guards decide how wrong it can
///         afford to be.
contract YieldMarketTest is Test {
    YieldMarket market;
    SplitVault vault;
    MockStockToken stock;
    MockUSDG usdg;
    YieldToken yt;

    address admin = address(0xA11CE);
    address alice = address(0xA1);

    uint256 seriesId;
    uint64 maturity;

    /// @dev What Alice actually holds after the 0.1% split fee, not what she put in.
    uint256 ytBal;
    /// @dev A cent per YT. Bids are USDG base units per whole (1e18) YT.
    uint256 constant BID = 10_000;

    function setUp() public {
        vm.warp(1_700_000_000);
        maturity = uint64(block.timestamp + 180 days);

        vm.startPrank(admin);
        stock = new MockStockToken("Apple", "AAPL", admin);
        usdg = new MockUSDG(admin);
        vault = new SplitVault(admin);
        market = new YieldMarket(ISplitVault(address(vault)), IERC20(address(usdg)), admin);
        seriesId = vault.createSeries(address(stock), maturity);
        stock.mint(alice, 100e18);
        usdg.mint(admin, 10_000e6);
        usdg.approve(address(market), type(uint256).max);
        market.fund(5_000e6);
        vm.stopPrank();

        (, , , address ytAddr, ) = vault.series(seriesId);
        yt = YieldToken(ytAddr);

        vm.startPrank(alice);
        stock.approve(address(vault), type(uint256).max);
        vault.split(seriesId, 10e18);
        yt.approve(address(market), type(uint256).max);
        vm.stopPrank();

        ytBal = yt.balanceOf(alice);
    }

    /// @dev The quote, computed the way the contract computes it, so a test never
    ///      hardcodes a number the pricing could drift away from.
    function _expected(uint256 amount) internal pure returns (uint256) {
        return (amount * BID) / 1e18;
    }

    function test_anUnpricedSeriesDoesNotTrade() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(YieldMarket.MarketClosed.selector, seriesId));
        market.sell(seriesId, 1e18, 0);
    }

    function test_sellingYieldPaysCashNow() public {
        vm.prank(admin);
        market.setBid(seriesId, BID, 1_000e6);

        uint256 want = _expected(ytBal);
        assertEq(market.quote(seriesId, ytBal), want, "quote disagrees with the fill");

        uint256 before = usdg.balanceOf(alice);
        vm.prank(alice);
        uint256 out = market.sell(seriesId, ytBal, 0);

        assertEq(out, want, "wrong fill");
        assertEq(usdg.balanceOf(alice) - before, want, "seller was not paid");
        assertEq(yt.balanceOf(address(market)), ytBal, "market did not take the yield token");
    }

    function test_theBudgetCapsAStaleBid() public {
        uint256 want = _expected(ytBal);
        uint256 appetite = want / 2;

        vm.prank(admin);
        market.setBid(seriesId, BID, appetite);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(YieldMarket.OverBudget.selector, seriesId, want, appetite));
        market.sell(seriesId, ytBal, 0);
    }

    function test_aSellerIsProtectedFromARepriceInFlight() public {
        uint256 agreed = _expected(ytBal);

        vm.startPrank(admin);
        market.setBid(seriesId, BID, 1_000e6);
        // The pricer cuts the bid to a fifth before the seller's transaction lands.
        market.setBid(seriesId, BID / 5, 1_000e6);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(YieldMarket.InsufficientCash.selector, agreed, (ytBal * (BID / 5)) / 1e18)
        );
        market.sell(seriesId, ytBal, agreed);
    }

    function test_theMarketCollectsTheAccretionItBought() public {
        vm.prank(admin);
        market.setBid(seriesId, BID, 1_000e6);
        vm.prank(alice);
        market.sell(seriesId, ytBal, 0);

        // A dividend, the way this chain pays one.
        vm.prank(admin);
        stock.accrueDividendBps(200);

        uint256 before = stock.balanceOf(address(market));
        market.harvest(seriesId);
        assertGt(stock.balanceOf(address(market)) - before, 0, "market collected nothing");
    }

    /// @dev The seller keeps what their YT earned before they sold. Only the future
    ///      changes hands, which is the same rule the token itself enforces.
    function test_theSellerKeepsWhatTheyAlreadyEarned() public {
        vm.prank(admin);
        stock.accrueDividendBps(100);

        uint256 earned = vault.claimableYield(seriesId, alice);
        assertGt(earned, 0);

        vm.prank(admin);
        market.setBid(seriesId, BID, 1_000e6);
        vm.prank(alice);
        market.sell(seriesId, ytBal, 0);

        assertApproxEqAbs(vault.claimableYield(seriesId, alice), earned, 2, "the sale took the past too");
    }

    function test_aBidAboveTheCapIsRefused() public {
        vm.prank(admin);
        vm.expectRevert();
        market.setBid(seriesId, 2e6, 1_000e6);
    }

    function test_cannotSpendCashItDoesNotHold() public {
        vm.startPrank(admin);
        market.setBid(seriesId, BID, 1_000_000e6);
        market.sweep(address(usdg), admin, 5_000e6);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(YieldMarket.InsufficientCash.selector, _expected(ytBal), 0)
        );
        market.sell(seriesId, ytBal, 0);
    }
}
