// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {StackVault} from "../src/StackVault.sol";

/// @title DeployStack
/// @notice Deploy the Stack vault, and open the baskets named in stacks/<chainid>.json.
/// @dev Two jobs in one run because the vault is useless without a basket and a basket
///      cannot exist without the vault. Re-running with the vault already in the
///      address book skips the deploy and only opens what is new.
///
///        ADMIN=0x... PRIVATE_KEY=0x... \
///          forge script script/DeployStack.s.sol --rpc-url robinhood_mainnet --broadcast
///
///      Every constituent is read for its symbol and decimals before anything is
///      created, and the run PRINTS WHAT IT READ next to what the recipe claims. A
///      recipe written against the wrong decimals produces a basket that mints and
///      redeems perfectly while holding a thousandth of what was meant, and no
///      assertion can catch that — only a person comparing two numbers can. So the
///      simulation is the review step, and it is not optional.
contract DeployStack is Script {
    using stdJson for string;

    function run() external {
        string memory book = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        string memory recipes = vm.readFile(string.concat("stacks/", vm.toString(block.chainid), ".json"));

        address admin = vm.envAddress("ADMIN");
        require(admin != address(0), "ADMIN is required");

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;

        address existing = vm.keyExistsJson(book, ".stackVault") ? book.readAddress(".stackVault") : address(0);

        console2.log("chain:   ", block.chainid);
        console2.log("deployer:", deployer);
        console2.log("admin:   ", admin);

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        // The deployer holds CREATOR_ROLE for the length of this run so it can open
        // the baskets, then hands over. Same pattern as every other module here.
        StackVault vault = existing == address(0) ? new StackVault(deployer) : StackVault(existing);
        console2.log(existing == address(0) ? "StackVault deployed:" : "StackVault reused:", address(vault));

        uint256 n = _count(recipes);
        require(n > 0, "no recipes in stacks/<chainid>.json");

        for (uint256 i = 0; i < n; ++i) {
            _openStack(vault, recipes, string.concat(".stacks[", vm.toString(i), "]"));
        }

        if (existing == address(0)) {
            vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), admin);
            vault.grantRole(vault.CREATOR_ROLE(), admin);
            vault.renounceRole(vault.CREATOR_ROLE(), deployer);
            vault.renounceRole(vault.DEFAULT_ADMIN_ROLE(), deployer);
        }

        vm.stopBroadcast();

        if (existing == address(0)) {
            require(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin), "admin missing admin role");
            require(!vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), deployer), "deployer still admin");
            console2.log("");
            console2.log("Paste into deployments/%s.json, then run `pnpm abis`:", vm.toString(block.chainid));
            console2.log('  "stackVault": "%s",', vm.toString(address(vault)));
        }
    }

    /// @dev Reads one recipe, prints what the chain says about each constituent beside
    ///      what the file claims, and opens the basket.
    function _openStack(StackVault vault, string memory recipes, string memory base) private {
        string memory name_ = recipes.readString(string.concat(base, ".name"));
        string memory symbol_ = recipes.readString(string.concat(base, ".symbol"));

        uint256 c = _countConstituents(recipes, base);
        address[] memory tokens = new address[](c);
        uint256[] memory units = new uint256[](c);

        console2.log("");
        console2.log(string.concat("STACK  ", symbol_, "  -  ", name_));

        for (uint256 i = 0; i < c; ++i) {
            string memory k = string.concat(base, ".constituents[", vm.toString(i), "]");
            tokens[i] = recipes.readAddress(string.concat(k, ".address"));
            units[i] = recipes.readUint(string.concat(k, ".unitsPerShare"));
            _report(recipes, k, tokens[i], units[i]);
        }

        uint256 id = vault.createStack(name_, symbol_, tokens, units);
        (address token,,,,) = vault.stackOf(id);
        console2.log("  created id", id);
        console2.log("  share token:", token);
    }

    /// @dev Prints what the chain says about a constituent beside what the file
    ///      claims, and refuses the run if the decimals disagree. Split out to keep
    ///      the caller's stack shallow — and because this is the review step, so it
    ///      deserves to be a named thing rather than six lines inside a loop.
    function _report(string memory recipes, string memory k, address token, uint256 units) private view {
        uint256 claimed = recipes.readUint(string.concat(k, ".decimals"));
        uint8 actual = IERC20Metadata(token).decimals();

        console2.log(
            string.concat(
                "  ",
                recipes.readString(string.concat(k, ".symbol")),
                "  ->  onchain symbol ",
                IERC20Metadata(token).symbol(),
                ", decimals ",
                vm.toString(uint256(actual))
            )
        );
        console2.log("     units per share:", units);

        // A recipe written against the wrong decimals produces a basket that mints and
        // redeems perfectly while holding a thousandth of what was meant. No assertion
        // downstream can catch that, so it is caught here, before anything is created.
        require(claimed == actual, "recipe decimals disagree with the chain");
    }

    function _count(string memory recipes) private view returns (uint256 n) {
        while (vm.keyExistsJson(recipes, string.concat(".stacks[", vm.toString(n), "].symbol"))) ++n;
    }

    function _countConstituents(string memory recipes, string memory base) private view returns (uint256 n) {
        while (vm.keyExistsJson(recipes, string.concat(base, ".constituents[", vm.toString(n), "].address"))) ++n;
    }
}
