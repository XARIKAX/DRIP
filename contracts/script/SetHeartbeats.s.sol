// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ChainlinkPriceOracle, IAggregatorV3} from "../src/adapters/ChainlinkPriceOracle.sol";

/// @title SetHeartbeats
/// @notice Push the listing's staleness bounds onto a deployed oracle.
/// @dev The deploy wires each feed's heartbeat once. Changing it afterwards needs this,
///      because the number lives onchain in the oracle and in listings/<chainid>.json,
///      and the two disagreeing is how a token ends up unpriceable on a site that says
///      it is fine.
///
///        PRIVATE_KEY=0x<admin> forge script script/SetHeartbeats.s.sol \
///          --rpc-url robinhood_mainnet --broadcast --slow
///
///      The caller must own the oracle, which on a production deploy is ADMIN. Feeds
///      already carrying the listed value are skipped, so this is cheap to re-run and
///      safe to run after editing one row.
///
///      A heartbeat is a claim about how often a feed updates. Widen it and the
///      protocol will price collateral on older data; the right value is the figure
///      Chainlink publishes for that feed, not one fitted to whatever the feeds
///      happened to be doing when somebody looked.
contract SetHeartbeats is Script {
    using stdJson for string;

    function run() external {
        string memory chain = vm.toString(block.chainid);
        string memory book = vm.readFile(string.concat("deployments/", chain, ".json"));
        string memory listing = vm.readFile(string.concat("listings/", chain, ".json"));

        ChainlinkPriceOracle oracle = ChainlinkPriceOracle(book.readAddress(".priceOracle"));
        uint256 fallbackHeartbeat = vm.keyExistsJson(listing, ".infra.defaultHeartbeat")
            ? listing.readUint(".infra.defaultHeartbeat")
            : 3600;

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        uint256 changed;
        for (uint256 i = 0; ; ++i) {
            string memory base = string.concat(".tokens[", vm.toString(i), "]");
            if (!vm.keyExistsJson(listing, string.concat(base, ".symbol"))) break;
            if (!listing.readBool(string.concat(base, ".enabled"))) continue;

            string memory symbol = listing.readString(string.concat(base, ".symbol"));
            address token = listing.readAddress(string.concat(base, ".address"));
            address feed = listing.readAddress(string.concat(base, ".feed"));

            string memory hbKey = string.concat(base, ".heartbeat");
            uint48 want = uint48(vm.keyExistsJson(listing, hbKey) ? listing.readUint(hbKey) : fallbackHeartbeat);

            (, , uint48 current) = oracle.feedOf(token);
            if (current == want) {
                console2.log(string.concat("SAME  ", symbol), current);
                continue;
            }

            oracle.setFeed(token, IAggregatorV3(feed), want);
            ++changed;
            console2.log(string.concat("SET   ", symbol, "  was"), current);
            console2.log("                 now", want);
        }

        vm.stopBroadcast();
        console2.log("Feeds updated:", changed);
    }
}
