// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";

/// @title FundPool
/// @notice Deposit USDG into the pool that fronts every advance and every loan.
/// @dev The pool is the protocol's working capital. With nothing in it, Early pays
///      nothing, Borrow lends nothing and the app renders a market with no depth. This
///      script is the one step no amount of code can do on its own: the USDG has to
///      already be in the caller's wallet.
///
///        AMOUNT=250000 PRIVATE_KEY=0x... forge script script/FundPool.s.sol \
///          --rpc-url robinhood_mainnet --broadcast
///
///      AMOUNT is in whole USDG. The depositor receives ERC-4626 shares and can
///      withdraw whatever is not currently lent out, exactly like any other LP —
///      seeding the pool is not a donation.
contract FundPool is Script {
    using stdJson for string;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);
        address usdg = book.readAddress(".usdg");
        address vaultAddr = book.readAddress(".advanceVault");

        uint256 whole = vm.envUint("AMOUNT");
        require(whole > 0, "AMOUNT required, in whole USDG");
        uint256 amount = whole * (10 ** IERC20Metadata(usdg).decimals());

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address funder = pk != 0 ? vm.addr(pk) : msg.sender;

        uint256 held = IERC20(usdg).balanceOf(funder);
        require(held >= amount, "not enough USDG in the funding wallet");

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        IERC20(usdg).approve(vaultAddr, amount);
        uint256 shares = AdvanceVault(vaultAddr).deposit(amount, funder);

        vm.stopBroadcast();

        console2.log("Funded pool with USDG:", whole);
        console2.log("Shares received:      ", shares);
        console2.log("Pool total assets:    ", AdvanceVault(vaultAddr).totalAssets());
    }
}
