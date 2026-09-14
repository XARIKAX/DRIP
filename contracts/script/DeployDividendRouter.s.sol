// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {DividendRouter} from "../src/DividendRouter.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// @title DeployDividendRouter
/// @notice Deploy the router that decides what a holder's dividends turn into.
/// @dev Standalone. It reads the swap adapter and USDG out of the address book, holds
///      no funds, and nothing else in the protocol points at it — so this deploy
///      migrates nothing and can be redone at any time without disturbing a position.
///
///        ADMIN=0x... PRIVATE_KEY=0x... \
///          forge script script/DeployDividendRouter.s.sol --rpc-url robinhood_mainnet --broadcast
///
///      ADMIN owns the router, whose only power is pointing at a different swap
///      adapter. It cannot move a holder's tokens: the router holds none, and a route
///      only ever moves what its own caller approved in the same transaction.
contract DeployDividendRouter is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);

        address swapAdapter = book.readAddress(".swapAdapter");
        address usdg = book.readAddress(".usdg");
        address admin = vm.envAddress("ADMIN");
        require(admin != address(0), "ADMIN is required");

        console2.log("chain:      ", block.chainid);
        console2.log("swapAdapter:", swapAdapter);
        console2.log("usdg:       ", usdg);
        console2.log("admin:      ", admin);

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        // Owned by ADMIN from birth. There is no handover step because there is
        // nothing privileged to do during the deploy.
        DividendRouter router = new DividendRouter(ISwapAdapter(swapAdapter), usdg, admin);

        vm.stopBroadcast();

        require(router.owner() == admin, "router owner is not ADMIN");
        require(address(router.adapter()) == swapAdapter, "router adapter mismatch");
        require(router.usdg() == usdg, "router usdg mismatch");

        console2.log("");
        console2.log("DividendRouter:", address(router));
        console2.log("");
        console2.log("Paste into deployments/%s.json, then run `pnpm abis`:", vm.toString(block.chainid));
        console2.log('  "dividendRouter": "%s",', vm.toString(address(router)));
    }
}
