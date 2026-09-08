// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {DividendRegistry} from "../src/DividendRegistry.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {DripCore} from "../src/DripCore.sol";
import {StreamEngine} from "../src/StreamEngine.sol";
import {Reinvestor} from "../src/Reinvestor.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {ChainlinkPriceOracle, IAggregatorV3} from "../src/adapters/ChainlinkPriceOracle.sol";
import {UniswapV3SwapAdapter, ISwapRouter02} from "../src/adapters/UniswapV3SwapAdapter.sol";
import {IDividendRegistry} from "../src/interfaces/IDividendRegistry.sol";
import {IAdvanceVault} from "../src/interfaces/IAdvanceVault.sol";
import {IStreamEngine} from "../src/interfaces/IStreamEngine.sol";
import {IReinvestor} from "../src/interfaces/IReinvestor.sol";
import {IDripCore} from "../src/interfaces/IDripCore.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";

/// @title DeployProduction
/// @notice Deploys the protocol against a chain's REAL assets. No mocks, no faucets,
///         no seeded calendar.
/// @dev The counterpart to Deploy.s.sol, which exists to make a testnet feel alive and
///      deploys MockUSDG, mock stock tokens and a fixed price venue to do it. Nothing
///      in that file belongs on a chain carrying money. This one takes every address
///      from listings/<chainid>.json — the file operations maintains and
///      VerifyUniverse.s.sol checks onchain — and deploys only protocol code.
///
///        ADMIN=0xmultisig forge script script/DeployProduction.s.sol \
///          --rpc-url robinhood_mainnet --broadcast
///
///      Run VerifyUniverse.s.sol against the same chain FIRST. This script re-checks
///      the few things it would be unrecoverable to get wrong (symbol, decimals, feed
///      liveness) but it is not a substitute for the full route verification.
///
///      Two deltas from the testnet deploy are worth stating out loud:
///
///      ADMIN, not the deployer, receives every role. HANDOFF.md section 5 ranks the
///      oracle key as the largest trust assumption in the protocol; handing it to
///      whichever hot key happened to run the deploy is the version of that risk with
///      no upside. The deployer keeps nothing — the script asserts that at the end.
///
///      The calendar starts empty. Dividends are declared by whoever holds ORACLE_ROLE
///      from real corporate action data. A seeded calendar on mainnet would be the
///      protocol asserting a dividend that no issuer ever declared.
contract DeployProduction is Script {
    using stdJson for string;

    struct Infra {
        address usdg;
        address router;
        uint24 defaultFeeTier;
    }

    struct Listing {
        address token;
        address feed;
        string symbol;
    }

    /// @dev Storage, not stack. Same reason as Deploy.s.sol: solc runs out of slots.
    struct Deployment {
        address oracle;
        address adapter;
        address registry;
        address vault;
        address core;
        address streamEngine;
        address reinvestor;
        address splitVault;
    }

    Deployment internal d;
    Infra internal infra;
    Listing[] internal listings;
    address internal admin;

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;

        _configure(vm.envAddress("ADMIN"));

        console2.log("Chain id:      ", block.chainid);
        console2.log("Deployer:      ", deployer);
        console2.log("Admin (roles): ", admin);
        console2.log("USDG:          ", infra.usdg);
        console2.log("SwapRouter02:  ", infra.router);
        console2.log("Enabled tokens:", listings.length);

        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();

        _deploy(deployer);
        _wireFeeds();
        _wireModules();
        _grantRoles(deployer);

        vm.stopBroadcast();

        _assertDeployerHoldsNothing(deployer);
        _writeAddressBook();
    }

    /// @dev Read the listing for this chain and check everything that would be
    ///      unrecoverable to get wrong. Separate from run() so the test suite drives
    ///      the same steps a broadcast does.
    function _configure(address admin_) internal {
        string memory path = string.concat("listings/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);

        infra = Infra({
            usdg: book.readAddress(".infra.usdg"),
            router: book.readAddress(".infra.swapRouter02"),
            defaultFeeTier: uint24(book.readUint(".infra.defaultFeeTier"))
        });

        admin = admin_;
        require(admin != address(0), "ADMIN required");

        _loadListings(book);
        require(listings.length > 0, "no enabled tokens in listing");

        // USDG's decimals are load bearing everywhere in the protocol. An 18 decimal
        // stablecoin here would not fail — it would silently misprice every advance
        // by twelve orders of magnitude.
        require(IERC20Metadata(infra.usdg).decimals() == 6, "USDG must be 6 decimals");
    }

    /// @dev Every enabled token in the listing, checked against the chain as it loads.
    ///      A token that fails here is a token that would have failed later inside
    ///      someone's deposit.
    function _loadListings(string memory book) internal {
        uint256 i;
        while (true) {
            string memory base = string.concat(".tokens[", vm.toString(i), "]");
            if (!vm.keyExistsJson(book, string.concat(base, ".symbol"))) break;

            string memory symbol = book.readString(string.concat(base, ".symbol"));
            if (book.readBool(string.concat(base, ".enabled"))) {
                address token = book.readAddress(string.concat(base, ".address"));
                address feed = book.readAddress(string.concat(base, ".feed"));

                // Rule one from the listing file: no feed, no listing.
                require(feed != address(0), string.concat("no feed for ", symbol));
                require(
                    keccak256(bytes(IERC20Metadata(token).symbol())) == keccak256(bytes(symbol)),
                    string.concat("symbol mismatch for ", symbol)
                );
                require(IERC20Metadata(token).decimals() == 18, string.concat("not 18 decimals: ", symbol));

                // A feed that cannot answer now will not answer inside a claim either.
                (, int256 answer,,,) = IAggregatorV3(feed).latestRoundData();
                require(answer > 0, string.concat("feed not answering for ", symbol));

                listings.push(Listing({token: token, feed: feed, symbol: symbol}));
            }
            unchecked {
                ++i;
            }
        }
    }

    /// @dev Oracle and adapter first: the protocol is wired to them at construction.
    function _deploy(address deployer) internal {
        // Owned by the deployer for the length of this script so the feeds can be set
        // in the same run; handed to ADMIN in _grantRoles before it ends. Note this is
        // the computed deployer, not msg.sender: inside a script function msg.sender is
        // whoever called run(), which under --broadcast is not the broadcasting key.
        d.oracle = address(new ChainlinkPriceOracle(deployer));
        d.adapter = address(
            new UniswapV3SwapAdapter(ISwapRouter02(infra.router), infra.usdg, IPriceOracle(d.oracle), deployer)
        );

        d.registry = address(new DividendRegistry(deployer));
        d.vault = address(new AdvanceVault(IERC20(infra.usdg), deployer));
        d.core = address(
            new DripCore(IDividendRegistry(d.registry), IAdvanceVault(d.vault), IERC20(infra.usdg), deployer)
        );
        d.streamEngine = address(new StreamEngine(IAdvanceVault(d.vault), IERC20(infra.usdg), deployer));
        d.reinvestor = address(
            new Reinvestor(IERC20(infra.usdg), IDripCore(d.core), ISwapAdapter(d.adapter), deployer)
        );
        d.splitVault = address(
            new SplitVault(IDripCore(d.core), IDividendRegistry(d.registry), IERC20(infra.usdg), deployer)
        );
    }

    /// @dev One Chainlink feed per listed token, then register the token so it shows up
    ///      in the app. Default heartbeat (1 hour) — the staleness rule from the listing.
    function _wireFeeds() internal {
        ChainlinkPriceOracle oracle = ChainlinkPriceOracle(d.oracle);
        UniswapV3SwapAdapter adapter = UniswapV3SwapAdapter(d.adapter);
        DividendRegistry registry = DividendRegistry(d.registry);

        adapter.setDefaultFeeTier(infra.defaultFeeTier);

        for (uint256 i = 0; i < listings.length; ++i) {
            oracle.setFeed(listings[i].token, IAggregatorV3(listings[i].feed), 0);
            registry.addSupportedToken(listings[i].token);
            console2.log(listings[i].symbol, listings[i].token);
        }
    }

    /// @dev Identical to Deploy.s.sol's _wire. Kept as its own function rather than
    ///      shared with it because the two scripts must be free to diverge without one
    ///      silently changing the other's wiring.
    function _wireModules() internal {
        DripCore core = DripCore(d.core);
        StreamEngine streamEngine = StreamEngine(d.streamEngine);

        core.setStreamEngine(IStreamEngine(d.streamEngine));
        core.setReinvestor(IReinvestor(d.reinvestor));
        core.setSwapAdapter(ISwapAdapter(d.adapter));
        streamEngine.setReinvestor(IReinvestor(d.reinvestor));

        AdvanceVault vault = AdvanceVault(d.vault);
        Reinvestor reinvestor = Reinvestor(d.reinvestor);
        DividendRegistry registry = DividendRegistry(d.registry);

        vault.grantRole(vault.CORE_ROLE(), d.core);
        vault.grantRole(vault.CORE_ROLE(), d.streamEngine);
        streamEngine.grantRole(streamEngine.CORE_ROLE(), d.core);
        reinvestor.grantRole(reinvestor.CORE_ROLE(), d.streamEngine);
        reinvestor.grantRole(reinvestor.CORE_ROLE(), d.core);
        core.grantRole(core.REINVESTOR_ROLE(), d.reinvestor);
        registry.grantRole(registry.SETTLER_ROLE(), d.core);
    }

    /// @dev Hand everything to ADMIN and drop the deployer. Ownable contracts transfer;
    ///      AccessControl contracts grant then renounce, admin role last — renouncing
    ///      DEFAULT_ADMIN_ROLE first would strip the right to grant the others.
    function _grantRoles(address deployer) internal {
        ChainlinkPriceOracle(d.oracle).transferOwnership(admin);
        UniswapV3SwapAdapter(d.adapter).transferOwnership(admin);

        _handOver(d.registry, deployer, DividendRegistry(d.registry).ORACLE_ROLE());
        _handOver(d.vault, deployer, bytes32(0));
        _handOver(d.core, deployer, DripCore(d.core).KEEPER_ROLE());
        _handOver(d.streamEngine, deployer, StreamEngine(d.streamEngine).KEEPER_ROLE());
        _handOver(d.reinvestor, deployer, bytes32(0));
        _handOver(d.splitVault, deployer, SplitVault(d.splitVault).KEEPER_ROLE());
    }

    /// @dev Grant ADMIN the default admin role plus one operational role, then have the
    ///      deployer renounce both. `extra` is bytes32(0) where the contract has no
    ///      operational role beyond the admin one.
    function _handOver(address target, address deployer, bytes32 extra) internal {
        IAccessControl ac = IAccessControl(target);
        bytes32 adminRole = 0x00;

        ac.grantRole(adminRole, admin);
        if (extra != bytes32(0)) {
            ac.grantRole(extra, admin);
            if (ac.hasRole(extra, deployer)) ac.renounceRole(extra, deployer);
        }
        ac.renounceRole(adminRole, deployer);
    }

    /// @dev The deploy is not finished until the key that ran it cannot do anything with
    ///      what it built. Cheaper to assert here than to discover in an audit.
    function _assertDeployerHoldsNothing(address deployer) internal view {
        require(ChainlinkPriceOracle(d.oracle).owner() == admin, "oracle still owned by deployer");
        require(UniswapV3SwapAdapter(d.adapter).owner() == admin, "adapter still owned by deployer");

        address[6] memory acl = [d.registry, d.vault, d.core, d.streamEngine, d.reinvestor, d.splitVault];
        for (uint256 i = 0; i < acl.length; ++i) {
            require(!IAccessControl(acl[i]).hasRole(0x00, deployer), "deployer still admin");
            require(IAccessControl(acl[i]).hasRole(0x00, admin), "admin missing admin role");
        }
        require(!DividendRegistry(d.registry).hasRole(DividendRegistry(d.registry).ORACLE_ROLE(), deployer), "deployer still oracle");
    }

    /// @dev Same shape the testnet deploy writes, so the SDK, the app and the MCP
    ///      server read a mainnet book with no branching. `mocks: false` is the one
    ///      field that differs in meaning: the app hides its faucets on it.
    function _writeAddressBook() internal {
        string memory tokensKey = "tokens";
        string memory pricesKey = "prices";
        string memory tokensJson;
        string memory pricesJson;

        for (uint256 i = 0; i < listings.length; ++i) {
            tokensJson = vm.serializeAddress(tokensKey, listings[i].symbol, listings[i].token);
            // A snapshot for display only. Every live read goes through the oracle.
            pricesJson =
                vm.serializeUint(pricesKey, listings[i].symbol, ChainlinkPriceOracle(d.oracle).priceUsdg(listings[i].token));
        }

        string memory root = "root";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeUint(root, "deployedAt", block.timestamp);
        vm.serializeBool(root, "mocks", false);
        vm.serializeAddress(root, "admin", admin);
        vm.serializeAddress(root, "usdg", infra.usdg);
        vm.serializeAddress(root, "dividendRegistry", d.registry);
        vm.serializeAddress(root, "advanceVault", d.vault);
        vm.serializeAddress(root, "dripCore", d.core);
        vm.serializeAddress(root, "streamEngine", d.streamEngine);
        vm.serializeAddress(root, "reinvestor", d.reinvestor);
        vm.serializeAddress(root, "swapAdapter", d.adapter);
        vm.serializeAddress(root, "splitVault", d.splitVault);
        vm.serializeAddress(root, "priceOracle", d.oracle);
        vm.serializeString(root, "prices", pricesJson);
        string memory out = vm.serializeString(root, "tokens", tokensJson);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console2.log("Address book written to", path);
    }
}

/// @notice The AccessControl surface this script drives.
/// @dev Declared locally so the script does not care which OZ version each module
///      inherits, only that they all expose this.
interface IAccessControl {
    function grantRole(bytes32 role, address account) external;
    function renounceRole(bytes32 role, address account) external;
    function hasRole(bytes32 role, address account) external view returns (bool);
}
