// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DripTestBase} from "./DripTestBase.sol";
import {DividendRegistry} from "../src/DividendRegistry.sol";
import {IDividendRegistry} from "../src/interfaces/IDividendRegistry.sol";
import {Dividend, DividendStatus} from "../src/interfaces/DripTypes.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract DividendRegistryTest is DripTestBase {
    function test_DeclareRecordsEverything() public {
        uint64 ex = uint64(block.timestamp) + 1 days;
        uint64 pay = ex + 21 days;

        vm.expectEmit(true, true, false, true, address(registry));
        emit IDividendRegistry.DividendDeclared(1, address(aapl), 0.26e6, ex, pay);

        vm.prank(admin);
        uint256 id = registry.declareDividend(address(aapl), 0.26e6, ex, pay);

        assertEq(id, 1);
        Dividend memory d = registry.getDividend(id);
        assertEq(d.stockToken, address(aapl));
        assertEq(d.amountPerToken, 0.26e6);
        assertEq(d.exDate, ex);
        assertEq(d.payDate, pay);
        assertEq(uint8(d.status), uint8(DividendStatus.DECLARED));
        assertEq(registry.dividendCount(), 1);
    }

    function test_DeclareRegistersTokenOnce() public {
        declare(aapl, 0.26e6, 1 days, 21 days);
        declare(aapl, 0.27e6, 2 days, 21 days);
        declare(ko, 0.49e6, 1 days, 21 days);

        address[] memory tokens = registry.supportedTokens();
        assertEq(tokens.length, 2);
        assertEq(registry.dividendsForToken(address(aapl)).length, 2);
        assertEq(registry.dividendsForToken(address(ko)).length, 1);
    }

    function test_RevertWhen_NotOracle() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, registry.ORACLE_ROLE()
            )
        );
        vm.prank(alice);
        registry.declareDividend(address(aapl), 0.26e6, uint64(block.timestamp) + 1 days, uint64(block.timestamp) + 22 days);
    }

    function test_RevertWhen_ExDateInPast() public {
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(DividendRegistry.ExDateInPast.selector, uint64(block.timestamp) - 1, block.timestamp)
        );
        registry.declareDividend(address(aapl), 0.26e6, uint64(block.timestamp) - 1, uint64(block.timestamp) + 22 days);
    }

    function test_RevertWhen_PayBeforeEx() public {
        uint64 ex = uint64(block.timestamp) + 10 days;
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(DividendRegistry.PayDateBeforeExDate.selector, ex, ex));
        registry.declareDividend(address(aapl), 0.26e6, ex, ex);
    }

    function test_RevertWhen_WindowTooLong() public {
        uint64 ex = uint64(block.timestamp) + 1 days;
        uint64 pay = ex + 91 days;
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(DividendRegistry.SettlementWindowTooLong.selector, uint64(91 days)));
        registry.declareDividend(address(aapl), 0.26e6, ex, pay);
    }

    function test_RevertWhen_ZeroAmount() public {
        vm.prank(admin);
        vm.expectRevert(DividendRegistry.ZeroAmount.selector);
        registry.declareDividend(address(aapl), 0, uint64(block.timestamp) + 1 days, uint64(block.timestamp) + 22 days);
    }

    function test_OnlySettlerCanSettle() public {
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, admin, registry.SETTLER_ROLE()
            )
        );
        vm.prank(admin);
        registry.settleDividend(id, 1e6);
    }

    function test_VoidThenNoFurtherTransitions() public {
        uint256 id = declare(aapl, 0.26e6, 1 days, 21 days);
        vm.prank(admin);
        registry.voidDividend(id, "issuer cancelled");
        assertEq(uint8(registry.statusOf(id)), uint8(DividendStatus.VOIDED));

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(DividendRegistry.NotDeclared.selector, id, DividendStatus.VOIDED)
        );
        registry.voidDividend(id, "again");
    }

    function test_Paging() public {
        for (uint256 i = 0; i < 5; ++i) {
            declare(aapl, 0.26e6 + i, uint64(1 days + i), 21 days);
        }
        Dividend[] memory page = registry.getDividends(0, 3);
        assertEq(page.length, 3);
        assertEq(page[0].amountPerToken, 0.26e6);
        assertEq(page[2].amountPerToken, 0.26e6 + 2);

        Dividend[] memory tail = registry.getDividends(3, 10);
        assertEq(tail.length, 2);

        Dividend[] memory none = registry.getDividends(50, 10);
        assertEq(none.length, 0);
    }

    function test_AddSupportedTokenBeforeAnyDividend() public {
        vm.prank(admin);
        registry.addSupportedToken(address(ko));
        assertEq(registry.supportedTokens().length, 1);
        vm.prank(admin);
        registry.addSupportedToken(address(ko));
        assertEq(registry.supportedTokens().length, 1);
    }
}
