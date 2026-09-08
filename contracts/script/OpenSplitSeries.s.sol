// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {SplitVault} from "../src/SplitVault.sol";

/// @title OpenSplitSeries
/// @notice Open a split series so the Split page has something to offer.
/// @dev The production deploy registers stock and wires SplitVault, but opens no
///      series — the same way it declares no dividends. A series fixes a maturity, and
///      choosing that date is a decision about the product, not something a deploy
///      script should invent.
///
///      Until one exists the Split page renders correctly and empty: working contracts
///      with nothing in them. This is the one command that changes that.
///
///        SYMBOL=AAPL MATURITY_DAYS=180 PRIVATE_KEY=0x... \
///          forge script script/OpenSplitSeries.s.sol --rpc-url robinhood_mainnet --broadcast
///
///      Omit SYMBOL and it opens one for every enabled token in the listing instead,
///      skipping any that already has a series open:
///
///        MATURITY_DAYS=180 PRIVATE_KEY=0x... \
///          forge script script/OpenSplitSeries.s.sol --rpc-url robinhood_mainnet --broadcast
///
///      Every series in one run shares a maturity, which is the point: a common expiry
///      is what lets the dividend tokens of different stocks be compared against each
///      other rather than each being its own island.
///
///      The caller must hold SplitVault's KEEPER_ROLE, which on a production deploy is
///      ADMIN. One series per stock at a time: the vault refuses a second while the
///      first is open, so a new maturity waits for the old one to be fully redeemed.
contract OpenSplitSeries is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);
        SplitVault vault = SplitVault(book.readAddress(".splitVault"));

        uint256 daysOut = vm.envOr("MATURITY_DAYS", uint256(180));
        require(daysOut > 0, "MATURITY_DAYS must be positive");
        uint64 maturity = uint64(block.timestamp + daysOut * 1 days);

        string memory only = vm.envOr("SYMBOL", string(""));
        string[] memory symbols = bytes(only).length > 0 ? one(only) : enabledSymbols();

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        uint256 opened;
        for (uint256 i = 0; i < symbols.length; ++i) {
            address stockToken = book.readAddress(string.concat(".tokens.", symbols[i]));

            // Skipped rather than reverted, so one already open stock cannot stop the
            // other ten. Re-running after adding a listing is then safe.
            if (vault.activeSeriesOf(stockToken) != 0) {
                console2.log(string.concat("SKIP  ", symbols[i], " - a series is already open"));
                continue;
            }

            uint256 seriesId = vault.createSeries(stockToken, maturity);
            ++opened;
            console2.log(string.concat("OPEN  ", symbols[i], " series"), seriesId);
        }

        vm.stopBroadcast();

        console2.log("Series opened: ", opened);
        console2.log("  matures at unix:", maturity);
        console2.log("  days out:       ", daysOut);
    }

    function one(string memory symbol) internal pure returns (string[] memory out) {
        out = new string[](1);
        out[0] = symbol;
    }

    /// @dev Every enabled token in the listing, in listing order. The same source
    ///      VerifyUniverse checks and the deploy wires, so the three cannot drift.
    function enabledSymbols() internal view returns (string[] memory out) {
        string memory book = vm.readFile(string.concat("listings/", vm.toString(block.chainid), ".json"));

        uint256 n;
        while (vm.keyExistsJson(book, string.concat(".tokens[", vm.toString(n), "].symbol"))) ++n;

        string[] memory buf = new string[](n);
        uint256 count;
        for (uint256 i = 0; i < n; ++i) {
            string memory base = string.concat(".tokens[", vm.toString(i), "]");
            if (!book.readBool(string.concat(base, ".enabled"))) continue;
            buf[count++] = book.readString(string.concat(base, ".symbol"));
        }

        out = new string[](count);
        for (uint256 i = 0; i < count; ++i) out[i] = buf[i];
    }
}
