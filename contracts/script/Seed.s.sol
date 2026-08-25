// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {DividendRegistry} from "../src/DividendRegistry.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {DripCore} from "../src/DripCore.sol";

/// @title Seed
/// @notice Makes a fresh deployment look like a live market in one command.
/// @dev Funds the vault so advances are possible, tops up the deployer, and declares
///      three dividends across three tickers with staggered ex dates: one already ex
///      so a stream can be opened immediately, one going ex tomorrow, one next week.
///      Without this the app is technically correct and completely empty.
///
///        forge script script/Seed.s.sol --rpc-url local --broadcast
contract Seed is Script {
    using stdJson for string;

    /// @notice USDG the vault starts with. Enough to front everything the demo can create.
    uint256 public constant VAULT_SEED = 2_000_000e6;

    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);

        address usdg = book.readAddress(".usdg");
        address registryAddr = book.readAddress(".dividendRegistry");
        address vaultAddr = book.readAddress(".advanceVault");
        address aapl = book.readAddress(".tokens.AAPL");
        address ko = book.readAddress(".tokens.KO");
        address msft = book.readAddress(".tokens.MSFT");

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer;
        if (pk != 0) {
            deployer = vm.addr(pk);
            vm.startBroadcast(pk);
        } else {
            deployer = msg.sender;
            vm.startBroadcast();
        }

        // 1. Capital. Without LPs there is nothing to advance against.
        MockUSDG(usdg).mint(deployer, 10_000_000e6);
        IERC20(usdg).approve(vaultAddr, VAULT_SEED);
        AdvanceVault(vaultAddr).deposit(VAULT_SEED, deployer);
        console2.log("Vault seeded with USDG:", VAULT_SEED / 1e6);

        // 2. Stock for the deployer, so a demo wallet can deposit without the faucet.
        MockStockToken(aapl).mint(deployer, 10_000e18);
        MockStockToken(ko).mint(deployer, 10_000e18);
        MockStockToken(msft).mint(deployer, 10_000e18);

        // 3. The calendar. Real world quarterly amounts, testnet timing.
        DividendRegistry registry = DividendRegistry(registryAddr);
        uint64 nowTs = uint64(block.timestamp);

        // Goes ex in a minute. A declaration cannot be backdated, so this is as close to
        // "already ex" as the registry allows. The local dev script fast forwards the
        // chain past it immediately so the demo has a live stream from the first click.
        uint256 d1 = registry.declareDividend(aapl, 0.26e6, nowTs + 60, nowTs + 60 + 21 days);
        // Goes ex tomorrow.
        uint256 d2 = registry.declareDividend(ko, 0.51e6, nowTs + 1 days, nowTs + 1 days + 21 days);
        // Goes ex next week.
        uint256 d3 = registry.declareDividend(msft, 0.83e6, nowTs + 7 days, nowTs + 7 days + 21 days);

        console2.log("Declared AAPL dividend:", d1);
        console2.log("Declared KO dividend:", d2);
        console2.log("Declared MSFT dividend:", d3);

        vm.stopBroadcast();

        console2.log("Seed complete. Connect a wallet, faucet, deposit, pick a mode.");
    }
}
