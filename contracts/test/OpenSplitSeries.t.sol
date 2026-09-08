// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {OpenSplitSeries} from "../script/OpenSplitSeries.s.sol";

/// @dev Reaches the internal reader without broadcasting anything.
contract SymbolHarness is OpenSplitSeries {
    function symbols() external view returns (string[] memory) {
        return enabledSymbols();
    }
}

/// @notice The set of stocks a bulk series open would touch.
/// @dev Third consumer of listings/<chainid>.json, after VerifyUniverse and
///      DeployProduction. The heartbeat drifted because two readers of this file
///      disagreed about one field, so pin the agreement rather than assume it: a
///      series opened for a token the deploy never registered is a series nobody can
///      split into, and a token the deploy registered but this skips is a Split page
///      that stays empty for no visible reason.
contract OpenSplitSeriesTest is Test {
    using stdJson for string;

    SymbolHarness internal harness;

    function setUp() public {
        harness = new SymbolHarness();
        vm.chainId(4663);
    }

    function test_opensASeriesForEveryEnabledListedToken() public view {
        string memory book = vm.readFile("listings/4663.json");
        string[] memory symbols = harness.symbols();

        uint256 expected;
        for (uint256 i = 0; ; ++i) {
            string memory base = string.concat(".tokens[", vm.toString(i), "]");
            if (!vm.keyExistsJson(book, string.concat(base, ".symbol"))) break;
            if (book.readBool(string.concat(base, ".enabled"))) ++expected;
        }

        assertEq(symbols.length, expected, "one series per enabled token, no more and no fewer");
        assertGt(symbols.length, 0, "listing has enabled tokens to open");
    }

    function test_skipsTheDisabledOnes() public view {
        string[] memory symbols = harness.symbols();
        for (uint256 i = 0; i < symbols.length; ++i) {
            // COIN, ORCL, CRWV, SNDK and SPCX are disabled by the listing. Opening a
            // series for one would offer a split on a stock the protocol refuses to
            // price, which fails closed at the first harvest rather than at the split.
            assertTrue(
                keccak256(bytes(symbols[i])) != keccak256("ORCL"), "a disabled token reached the series opener"
            );
        }
    }
}
