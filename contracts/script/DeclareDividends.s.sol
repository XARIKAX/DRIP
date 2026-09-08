// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {DividendRegistry} from "../src/DividendRegistry.sol";
import {DividendStatus} from "../src/interfaces/DripTypes.sol";

/// @title DeclareDividends
/// @notice The dividend oracle, as a script. Reads a corporate action file and puts
///         what it says on the calendar.
/// @dev This is the operational job HANDOFF.md section 5 calls the protocol's largest
///      trust assumption, and it is worth being exact about what this script is and is
///      not. It is the mechanism: whoever holds ORACLE_ROLE runs it, it validates, and
///      it declares. It is NOT a data source. The file it reads has to be produced from
///      real issuer corporate action data by whoever operates the protocol.
///
///      Declaring a dividend no issuer declared is not a bug in this script, it is the
///      protocol advancing real USDG against income that will never arrive — the exact
///      loss path the vault's utilisation cap and clawback exist to bound. Nothing here
///      invents a number, and nothing here should.
///
///        forge script script/DeclareDividends.s.sol --rpc-url robinhood_mainnet --broadcast
///
///      Reads dividends/<chainid>.json:
///
///        {
///          "dividends": [
///            { "symbol": "AAPL", "amountPerToken": 260000,
///              "exDate": 1790000000, "payDate": 1791800000 }
///          ]
///        }
///
///      amountPerToken is USDG per whole share, 6 decimals: 260000 is $0.26. Dates are
///      unix seconds. Re-running is safe: an entry already on the calendar with the same
///      token, amount and ex date is skipped rather than declared twice.
contract DeclareDividends is Script {
    using stdJson for string;

    function run() external {
        string memory bookPath = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(bookPath);
        DividendRegistry registry = DividendRegistry(book.readAddress(".dividendRegistry"));

        string memory feedPath = string.concat("dividends/", vm.toString(block.chainid), ".json");
        string memory feed = vm.readFile(feedPath);

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        uint256 declared;
        uint256 skipped;
        uint256 i;
        while (vm.keyExistsJson(feed, string.concat(".dividends[", vm.toString(i), "].symbol"))) {
            string memory base = string.concat(".dividends[", vm.toString(i), "]");
            string memory symbol = feed.readString(string.concat(base, ".symbol"));
            address token = book.readAddress(string.concat(".tokens.", symbol));
            uint256 amountPerToken = feed.readUint(string.concat(base, ".amountPerToken"));
            uint64 exDate = uint64(feed.readUint(string.concat(base, ".exDate")));
            uint64 payDate = uint64(feed.readUint(string.concat(base, ".payDate")));

            if (_alreadyDeclared(registry, token, amountPerToken, exDate)) {
                console2.log(string.concat("SKIP  ", symbol, " (already on the calendar)"));
                ++skipped;
            } else if (exDate < block.timestamp) {
                // The registry would revert. Say why, and keep going: one stale row in
                // the file should not strand the rest of the calendar.
                console2.log(string.concat("SKIP  ", symbol, " (ex date already passed)"));
                ++skipped;
            } else {
                uint256 id = registry.declareDividend(token, amountPerToken, exDate, payDate);
                console2.log(string.concat("DECLARE ", symbol), id);
                ++declared;
            }
            unchecked {
                ++i;
            }
        }

        vm.stopBroadcast();

        console2.log("Declared:", declared);
        console2.log("Skipped: ", skipped);
        require(i > 0, "no dividends in the feed file");
    }

    /// @dev Idempotency. A keeper that runs on a schedule will see the same file more
    ///      than once, and a double declaration is a double advance against one payment.
    function _alreadyDeclared(DividendRegistry registry, address token, uint256 amountPerToken, uint64 exDate)
        private
        view
        returns (bool)
    {
        uint256[] memory ids = registry.dividendsForToken(token);
        for (uint256 j = 0; j < ids.length; ++j) {
            if (registry.getDividend(ids[j]).exDate == exDate
                && registry.getDividend(ids[j]).amountPerToken == amountPerToken
                && registry.getDividend(ids[j]).status != DividendStatus.VOIDED) {
                return true;
            }
        }
        return false;
    }
}
