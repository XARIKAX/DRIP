// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DividendRegistry} from "../src/DividendRegistry.sol";
import {DripCore} from "../src/DripCore.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {Dividend, DividendStatus} from "../src/interfaces/DripTypes.sol";

/// @title ReserveReport
/// @notice What the declared calendar will cost to settle, and whether the reserve
///         covers it.
/// @dev Read only. Broadcasts nothing, needs no key, safe to run on a schedule.
///
///        RESERVE=0x<wallet> forge script script/ReserveReport.s.sol --rpc-url robinhood_mainnet
///
///      Settling a dividend pulls the full ex date entitlement from the settling
///      wallet. Where the protocol is funded from its own reserves rather than by an
///      issuer, that wallet is a promise the operator has made and every declared row
///      is a dated bill against it. The failure mode is quiet and late: the pool
///      advances at the ex date, the pay date arrives, the wallet is short, and the
///      vault's receivable sits unretired while LPs carry it.
///
///      So the number worth knowing is not the balance, it is the balance against the
///      schedule. This prints both, per pay date and cumulatively, and says the date
///      the reserve runs out rather than leaving it to be discovered.
contract ReserveReport is Script {
    using stdJson for string;

    function run() external view {
        string memory book = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        DividendRegistry registry = DividendRegistry(book.readAddress(".dividendRegistry"));
        DripCore core = DripCore(book.readAddress(".dripCore"));
        AdvanceVault vault = AdvanceVault(book.readAddress(".advanceVault"));
        IERC20 usdg = IERC20(book.readAddress(".usdg"));

        address reserve = vm.envOr("RESERVE", address(0));
        uint256 held = reserve == address(0) ? 0 : usdg.balanceOf(reserve);

        console2.log("Reserve wallet: ", reserve);
        console2.log("USDG held:      ", held);
        console2.log("Pool assets:    ", vault.totalAssets());
        console2.log("Receivables:    ", vault.receivables());
        console2.log("");

        uint256 count = registry.dividendCount();
        if (count == 0) {
            console2.log("Calendar is empty. Nothing declared, nothing owed.");
            return;
        }

        // Declared rows are bills. Sorted by pay date so the cumulative column answers
        // "how much do I need, and by when" rather than just "how much in total".
        uint256[] memory ids = new uint256[](count);
        uint256 n;
        for (uint256 id = 1; id <= count; ++id) {
            if (registry.getDividend(id).status == DividendStatus.DECLARED) ids[n++] = id;
        }
        for (uint256 a = 0; a + 1 < n; ++a) {
            for (uint256 b = 0; b + 1 < n - a; ++b) {
                if (registry.getDividend(ids[b]).payDate > registry.getDividend(ids[b + 1]).payDate) {
                    (ids[b], ids[b + 1]) = (ids[b + 1], ids[b]);
                }
            }
        }

        uint256 cumulative;
        uint256 shortfallAt;
        for (uint256 k = 0; k < n; ++k) {
            Dividend memory d = registry.getDividend(ids[k]);
            uint256 owed = core.totalEntitlementFor(ids[k]);
            cumulative += owed;

            console2.log("dividend", ids[k]);
            console2.log("  pay date unix:", d.payDate);
            console2.log("  costs:        ", owed);
            console2.log("  cumulative:   ", cumulative);
            if (d.payDate <= block.timestamp) console2.log("  DUE NOW");

            if (shortfallAt == 0 && cumulative > held) {
                shortfallAt = d.payDate;
                console2.log("  RESERVE RUNS OUT HERE");
            }
        }

        console2.log("");
        console2.log("Declared and unsettled:", n);
        console2.log("Total owed:            ", cumulative);
        if (cumulative > held) {
            console2.log("SHORTFALL:             ", cumulative - held);
            console2.log("  first unmet pay date:", shortfallAt);
            console2.log("  Fund the reserve before that date, or the vault carries the receivable.");
        } else {
            console2.log("Reserve covers the whole declared calendar.");
        }
    }
}
