// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";
import {DividendRegistry} from "../src/DividendRegistry.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {DripCore} from "../src/DripCore.sol";
import {StreamEngine} from "../src/StreamEngine.sol";
import {Reinvestor} from "../src/Reinvestor.sol";
import {IDividendRegistry} from "../src/interfaces/IDividendRegistry.sol";
import {IAdvanceVault} from "../src/interfaces/IAdvanceVault.sol";
import {IStreamEngine} from "../src/interfaces/IStreamEngine.sol";
import {IReinvestor} from "../src/interfaces/IReinvestor.sol";
import {IDripCore} from "../src/interfaces/IDripCore.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// @title Deploy
/// @notice Deploys the whole protocol plus testnet mocks and writes the address book
///         the SDK, the web app and the MCP server all read.
/// @dev Run against anvil or Arbitrum Sepolia:
///
///        forge script script/Deploy.s.sol --rpc-url local --broadcast
///
///      The address book lands at deployments/<chainid>.json. Nothing downstream
///      hardcodes an address; they all read that file.
///
///      Production changes exactly two things: skip the mock deployments and pass the
///      real USDG, real stock token and real Uniswap adapter addresses in. The wiring
///      below is unchanged. See HANDOFF.md.
contract Deploy is Script {
    struct StockConfig {
        string name;
        string symbol;
        uint256 priceUsdg;
    }

    /// @dev Held in storage rather than on the stack. The deploy touches nine addresses
    ///      and solc runs out of stack slots long before it runs out of patience.
    struct Deployment {
        address usdg;
        address registry;
        address vault;
        address core;
        address streamEngine;
        address reinvestor;
        address adapter;
    }

    Deployment internal d;
    address[5] internal stockAddresses;

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer;
        if (pk != 0) {
            deployer = vm.addr(pk);
            vm.startBroadcast(pk);
        } else {
            deployer = msg.sender;
            vm.startBroadcast();
        }

        console2.log("Deployer:", deployer);
        console2.log("Chain id:", block.chainid);

        StockConfig[5] memory stocks = [
            StockConfig("Apple Inc Stock Token", "AAPL", 220e6),
            StockConfig("Microsoft Corp Stock Token", "MSFT", 421e6),
            StockConfig("Coca Cola Co Stock Token", "KO", 62e6),
            StockConfig("Johnson and Johnson Stock Token", "JNJ", 155e6),
            StockConfig("NVIDIA Corp Stock Token", "NVDA", 176e6)
        ];

        _deployProtocol(deployer);
        _wire(deployer);
        _deployStockTokens(deployer, stocks);

        vm.stopBroadcast();

        _writeAddressBook(stocks);
    }

    /// @dev Testnet stand ins first, then the protocol on top of them. Production skips
    ///      the MockUSDG line and passes the canonical USDG address into the vault.
    function _deployProtocol(address deployer) private {
        MockUSDG usdg = new MockUSDG(deployer);
        d.usdg = address(usdg);

        d.registry = address(new DividendRegistry(deployer));
        d.vault = address(new AdvanceVault(IERC20(d.usdg), deployer));
        d.core = address(
            new DripCore(IDividendRegistry(d.registry), IAdvanceVault(d.vault), IERC20(d.usdg), deployer)
        );
        d.streamEngine = address(new StreamEngine(IAdvanceVault(d.vault), IERC20(d.usdg), deployer));
        d.adapter = address(new MockSwapAdapter(d.usdg, deployer));
        d.reinvestor =
            address(new Reinvestor(IERC20(d.usdg), IDripCore(d.core), ISwapAdapter(d.adapter), deployer));
    }

    /// @dev Module pointers and roles. Only protocol contracts move protocol money.
    ///      This block and DripTestBase must stay in step or the tests stop testing
    ///      what actually ships.
    function _wire(address deployer) private {
        DripCore core = DripCore(d.core);
        AdvanceVault vault = AdvanceVault(d.vault);
        StreamEngine streamEngine = StreamEngine(d.streamEngine);
        Reinvestor reinvestor = Reinvestor(d.reinvestor);
        DividendRegistry registry = DividendRegistry(d.registry);

        core.setStreamEngine(IStreamEngine(d.streamEngine));
        core.setReinvestor(IReinvestor(d.reinvestor));
        core.setSwapAdapter(ISwapAdapter(d.adapter));
        streamEngine.setReinvestor(IReinvestor(d.reinvestor));

        vault.grantRole(vault.CORE_ROLE(), d.core);
        vault.grantRole(vault.CORE_ROLE(), d.streamEngine);
        streamEngine.grantRole(streamEngine.CORE_ROLE(), d.core);
        streamEngine.grantRole(streamEngine.KEEPER_ROLE(), deployer);
        reinvestor.grantRole(reinvestor.CORE_ROLE(), d.streamEngine);
        reinvestor.grantRole(reinvestor.CORE_ROLE(), d.core);
        core.grantRole(core.REINVESTOR_ROLE(), d.reinvestor);
        registry.grantRole(registry.SETTLER_ROLE(), d.core);
    }

    /// @dev Five tickers, priced, registered and stocked so the reinvest swap always fills.
    function _deployStockTokens(address deployer, StockConfig[5] memory stocks) private {
        for (uint256 i = 0; i < stocks.length; ++i) {
            MockStockToken token = new MockStockToken(stocks[i].name, stocks[i].symbol, deployer);
            stockAddresses[i] = address(token);
            MockSwapAdapter(d.adapter).setPrice(address(token), stocks[i].priceUsdg);
            DividendRegistry(d.registry).addSupportedToken(address(token));
            token.mint(d.adapter, 5_000_000e18);
            console2.log(stocks[i].symbol, address(token));
        }
    }

    /// @dev One JSON file is the single source of truth for every address downstream.
    function _writeAddressBook(StockConfig[5] memory stocks) private {
        string memory tokensKey = "tokens";
        string memory tokensJson;
        for (uint256 i = 0; i < stocks.length; ++i) {
            tokensJson = vm.serializeAddress(tokensKey, stocks[i].symbol, stockAddresses[i]);
        }

        string memory pricesKey = "prices";
        string memory pricesJson;
        for (uint256 i = 0; i < stocks.length; ++i) {
            pricesJson = vm.serializeUint(pricesKey, stocks[i].symbol, stocks[i].priceUsdg);
        }

        string memory root = "root";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeUint(root, "deployedAt", block.timestamp);
        vm.serializeAddress(root, "usdg", d.usdg);
        vm.serializeAddress(root, "dividendRegistry", d.registry);
        vm.serializeAddress(root, "advanceVault", d.vault);
        vm.serializeAddress(root, "dripCore", d.core);
        vm.serializeAddress(root, "streamEngine", d.streamEngine);
        vm.serializeAddress(root, "reinvestor", d.reinvestor);
        vm.serializeAddress(root, "swapAdapter", d.adapter);
        vm.serializeString(root, "prices", pricesJson);
        string memory out = vm.serializeString(root, "tokens", tokensJson);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console2.log("Address book written to", path);
    }
}
