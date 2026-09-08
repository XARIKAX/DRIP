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
///      The caller must hold SplitVault's KEEPER_ROLE, which on a production deploy is
///      ADMIN. One series per stock at a time: the vault refuses a second while the
///      first is open, so a new maturity waits for the old one to be fully redeemed.
contract OpenSplitSeries is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);

        SplitVault vault = SplitVault(book.readAddress(".splitVault"));
        string memory symbol = vm.envString("SYMBOL");
        address stockToken = book.readAddress(string.concat(".tokens.", symbol));

        uint256 daysOut = vm.envOr("MATURITY_DAYS", uint256(180));
        require(daysOut > 0, "MATURITY_DAYS must be positive");
        uint64 maturity = uint64(block.timestamp + daysOut * 1 days);

        uint256 prior = vault.activeSeriesOf(stockToken);
        require(prior == 0, "a series is already open for this stock");

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        uint256 seriesId = vault.createSeries(stockToken, maturity);

        vm.stopBroadcast();

        console2.log(string.concat("Opened ", symbol, " series"), seriesId);
        console2.log("  matures at unix:", maturity);
        console2.log("  days out:       ", daysOut);
    }
}
