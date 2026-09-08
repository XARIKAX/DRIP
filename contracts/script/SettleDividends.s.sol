// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DividendRegistry} from "../src/DividendRegistry.sol";
import {DripCore} from "../src/DripCore.sol";
import {Dividend, DividendStatus} from "../src/interfaces/DripTypes.sol";

/// @title SettleDividends
/// @notice The pay-day keeper. Settles every declared dividend whose pay date has come.
/// @dev The other half of the oracle's job, and the half that costs money: settling a
///      dividend means paying the protocol the USDG the issuer paid, which retires the
///      vault's receivable and makes the holders who did not take an advance claimable.
///
///        PRIVATE_KEY=0x... forge script script/SettleDividends.s.sol \
///          --rpc-url robinhood_mainnet --broadcast
///
///      The caller must hold DripCore's KEEPER_ROLE and must have the USDG on hand:
///      settleDividend pulls the full entitlement total from the keeper's wallet. Where
///      that USDG comes from is the operational question HANDOFF.md section 7 leaves
///      open, and it is a question about a bank account, not about code.
///
///      DRY_RUN=1 reports what would be settled and what it would cost, and broadcasts
///      nothing. Run that first, every time.
contract SettleDividends is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);
        DividendRegistry registry = DividendRegistry(book.readAddress(".dividendRegistry"));
        DripCore core = DripCore(book.readAddress(".dripCore"));
        IERC20 usdg = IERC20(book.readAddress(".usdg"));

        bool dryRun = vm.envOr("DRY_RUN", uint256(0)) == 1;
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address keeper = pk != 0 ? vm.addr(pk) : msg.sender;

        uint256 count = registry.dividendCount();
        uint256[] memory due = new uint256[](count);
        uint256 dueCount;
        uint256 totalOwed;

        for (uint256 id = 1; id <= count; ++id) {
            Dividend memory d = registry.getDividend(id);
            if (d.status != DividendStatus.DECLARED) continue;
            if (block.timestamp < d.payDate) continue;
            due[dueCount++] = id;
            totalOwed += core.totalEntitlementFor(id);
        }

        console2.log("Dividends due for settlement:", dueCount);
        console2.log("USDG required:               ", totalOwed);
        console2.log("Keeper holds:                ", usdg.balanceOf(keeper));

        if (dueCount == 0) {
            console2.log("Nothing to settle.");
            return;
        }
        if (dryRun) {
            console2.log("DRY_RUN: nothing broadcast.");
            return;
        }

        require(usdg.balanceOf(keeper) >= totalOwed, "keeper cannot cover the settlement");

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        usdg.approve(address(core), totalOwed);
        for (uint256 i = 0; i < dueCount; ++i) {
            core.settleDividend(due[i]);
            console2.log("Settled dividend", due[i]);
        }

        vm.stopBroadcast();
    }
}
