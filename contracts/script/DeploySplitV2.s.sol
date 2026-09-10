// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SplitVault} from "../src/SplitVault.sol";
import {YieldMarket} from "../src/YieldMarket.sol";
import {ISplitVault} from "../src/interfaces/ISplitVault.sol";

/// @title DeploySplitV2
/// @notice Deploy the accretion-based SplitVault and its YieldMarket, and open a
///         series for every listed stock in one run.
/// @dev The deployed SplitVault cannot be upgraded into this one. Its constructor
///      arguments changed and so did its storage layout, and there is no proxy in
///      front of it — by design, since a split vault that could be silently rewritten
///      is a split vault nobody should put a share into. So this is a fresh deploy and
///      the address book gets a new address. Nothing is stranded: the old vault has no
///      PT supply, so nobody is mid-series.
///
///      Run it, then paste the two addresses and the block into deployments/<id>.json
///      and run `pnpm abis`. The script prints exactly what to paste.
///
///        ADMIN=0x... PRIVATE_KEY=0x... MATURITY_DAYS=180 \
///          forge script script/DeploySplitV2.s.sol --rpc-url robinhood_mainnet --broadcast
///
///      Simulate first, always — omit --broadcast and read the OPEN lines.
///
///      ADMIN must not be the deployer. The deployer opens the series in this run and
///      then holds nothing: every role ends up with ADMIN, and the script asserts that
///      before it finishes rather than trusting it.
contract DeploySplitV2 is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);

        address usdg = book.readAddress(".usdg");
        address admin = vm.envAddress("ADMIN");
        require(admin != address(0), "ADMIN is required");

        uint256 daysOut = vm.envOr("MATURITY_DAYS", uint256(180));
        require(daysOut > 0, "MATURITY_DAYS must be positive");
        uint64 maturity = uint64(block.timestamp + daysOut * 1 days);

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
        require(deployer != admin, "ADMIN must not be the deployer; roles are handed over at the end");

        console2.log("chain:    ", block.chainid);
        console2.log("deployer: ", deployer);
        console2.log("admin:    ", admin);
        console2.log("usdg:     ", usdg);
        console2.log("maturity: ", maturity);

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        // Deployer holds KEEPER_ROLE for the length of this script so it can open the
        // series, then hands everything to ADMIN below.
        SplitVault vault = new SplitVault(deployer);
        YieldMarket market = new YieldMarket(ISplitVault(address(vault)), IERC20(usdg), admin);

        console2.log("SplitVault:  ", address(vault));
        console2.log("YieldMarket: ", address(market));

        string[] memory symbols = enabledSymbols();
        uint256 opened;
        for (uint256 i = 0; i < symbols.length; ++i) {
            address stockToken = book.readAddress(string.concat(".tokens.", symbols[i]));

            // createSeries reads uiMultiplier() and reverts on a token that has none,
            // which is the check that matters: a token whose accretion cannot be read
            // would hand every dividend to PT and make YT worthless.
            uint256 seriesId = vault.createSeries(stockToken, maturity);
            ++opened;
            console2.log(string.concat("OPEN  ", symbols[i], " series"), seriesId);
        }

        // Hand over, then verify. An admin that never received a role is a deploy that
        // has to be done again, and finding out later is worse than reverting now.
        vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), admin);
        vault.grantRole(vault.KEEPER_ROLE(), admin);
        vault.renounceRole(vault.KEEPER_ROLE(), deployer);
        vault.renounceRole(vault.DEFAULT_ADMIN_ROLE(), deployer);

        vm.stopBroadcast();

        require(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin), "admin missing vault admin role");
        require(vault.hasRole(vault.KEEPER_ROLE(), admin), "admin missing vault keeper role");
        require(!vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), deployer), "deployer still admin on the vault");
        require(!vault.hasRole(vault.KEEPER_ROLE(), deployer), "deployer still keeper on the vault");
        require(market.hasRole(market.DEFAULT_ADMIN_ROLE(), admin), "admin missing market admin role");
        require(!market.hasRole(market.DEFAULT_ADMIN_ROLE(), deployer), "deployer holds market admin");

        console2.log("");
        console2.log("Series opened:", opened);
        console2.log("");
        console2.log("Paste into deployments/%s.json, then run `pnpm abis`:", vm.toString(block.chainid));
        console2.log('  "splitVault": "%s",', vm.toString(address(vault)));
        console2.log('  "splitVaultBlock": %s,', vm.toString(block.number));
        console2.log('  "yieldMarket": "%s",', vm.toString(address(market)));
    }

    /// @dev Every enabled token in the listing, the same source VerifyUniverse checks.
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
