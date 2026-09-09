// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RewardVault} from "../src/RewardVault.sol";

/// @title DeployRewardVault
/// @notice Deploy the reward token and write it into the address book.
/// @dev Standalone because the protocol is already live: this adds a contract beside
///      it rather than redeploying anything. Nothing existing is touched, and the
///      vault reaches nothing existing either — it holds USDG and mints its own token,
///      and that is the whole of its surface.
///
///        ADMIN=0x<multisig> PRIVATE_KEY=0x... \
///          forge script script/DeployRewardVault.s.sol --rpc-url robinhood_mainnet --broadcast --slow
///
///      ADMIN receives DEFAULT_ADMIN_ROLE and DISTRIBUTOR_ROLE. The deployer keeps
///      nothing, and the script refuses to finish until that is true.
contract DeployRewardVault is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);
        address usdg = book.readAddress(".usdg");
        address admin = vm.envAddress("ADMIN");
        require(admin != address(0), "ADMIN required");

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
        require(admin != deployer, "ADMIN must not be the deployer: the hot key ends up powerless by design");

        console2.log("Chain id:", block.chainid);
        console2.log("USDG:    ", usdg);
        console2.log("Admin:   ", admin);

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        RewardVault vault = new RewardVault(IERC20(usdg), admin);

        vm.stopBroadcast();

        // The constructor grants both roles to admin and none to the deployer, but a
        // deploy that says so and a deploy that checks are different things.
        require(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin), "admin missing admin role");
        require(vault.hasRole(vault.DISTRIBUTOR_ROLE(), admin), "admin missing distributor role");
        require(!vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), deployer), "deployer still admin");
        require(!vault.hasRole(vault.DISTRIBUTOR_ROLE(), deployer), "deployer still distributor");
        require(vault.totalSupply() == 0, "vault minted something at deploy");

        console2.log("RewardVault:", address(vault));
        console2.log("");
        console2.log("Add to deployments/%s.json as \"rewardVault\", then run pnpm abis:", vm.toString(block.chainid));
        console2.log("  \"rewardVault\": \"%s\",", vm.toString(address(vault)));
    }
}
