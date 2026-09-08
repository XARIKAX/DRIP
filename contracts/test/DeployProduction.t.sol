// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DeployProduction} from "../script/DeployProduction.s.sol";
import {MockAggregator} from "./ChainlinkPriceOracle.t.sol";
import {DividendRegistry} from "../src/DividendRegistry.sol";
import {AdvanceVault} from "../src/AdvanceVault.sol";
import {DripCore} from "../src/DripCore.sol";
import {StreamEngine} from "../src/StreamEngine.sol";
import {Reinvestor} from "../src/Reinvestor.sol";
import {SplitVault} from "../src/SplitVault.sol";
import {ChainlinkPriceOracle} from "../src/adapters/ChainlinkPriceOracle.sol";
import {LendingPool} from "../src/LendingPool.sol";
import {UniswapV3SwapAdapter} from "../src/adapters/UniswapV3SwapAdapter.sol";

/// @notice A stand in for a listed asset, placed at the real listing address.
contract FakeAsset is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory symbol_, uint8 decimals_) ERC20(symbol_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}

/// @notice Drives DeployProduction's steps without the broadcast or the JSON write.
/// @dev The write is deliberately left out: a test that produced
///      deployments/4663.json would leave a fake mainnet address book in the repo for
///      sync-abis.mjs to pick up and someone to commit. That is the exact failure this
///      whole file exists to prevent.
contract Harness is DeployProduction {
    function configure(address admin_) external {
        _configure(admin_);
    }

    function deployAll() external {
        _deploy(address(this));
        _wireFeeds();
        _wireModules();
        _grantRoles(address(this));
        _assertDeployerHoldsNothing(address(this));
    }

    function addresses() external view returns (Deployment memory) {
        return d;
    }

    function tokenCount() external view returns (uint256) {
        return listings.length;
    }

    function tokenAt(uint256 i) external view returns (address, address, string memory) {
        return (listings[i].token, listings[i].feed, listings[i].symbol);
    }

    function usdgAddress() external view returns (address) {
        return infra.usdg;
    }
}

/// @notice The mainnet deploy path, exercised against the real listings/4663.json.
/// @dev Every address in that file is etched with a stand in, so this runs the actual
///      script against the actual listing: if operations adds a token with a broken
///      symbol, no feed, or the wrong decimals, this suite goes red before a deploy
///      does. The one thing it cannot check is whether the real chain agrees with the
///      file — that is VerifyUniverse.s.sol's job, against a live RPC.
contract DeployProductionTest is Test {
    using stdJson for string;

    uint256 internal constant ROBINHOOD_MAINNET = 4663;

    Harness internal harness;
    address internal admin = makeAddr("multisig");
    address internal router = makeAddr("swapRouter02");

    function setUp() public {
        vm.chainId(ROBINHOOD_MAINNET);

        string memory book = vm.readFile("listings/4663.json");
        address usdg = book.readAddress(".infra.usdg");

        // USDG is 6 decimals; the script refuses anything else.
        deployCodeTo("DeployProduction.t.sol:FakeAsset", abi.encode("USDG", uint8(6)), usdg);
        vm.etch(router, hex"00");

        // Every enabled token gets an 18 decimal asset at its listed address and a
        // live 8 decimal feed at its listed feed address.
        uint256 i;
        while (vm.keyExistsJson(book, string.concat(".tokens[", vm.toString(i), "].symbol"))) {
            string memory base = string.concat(".tokens[", vm.toString(i), "]");
            if (book.readBool(string.concat(base, ".enabled"))) {
                string memory symbol = book.readString(string.concat(base, ".symbol"));
                deployCodeTo(
                    "DeployProduction.t.sol:FakeAsset",
                    abi.encode(symbol, uint8(18)),
                    book.readAddress(string.concat(base, ".address"))
                );
                // $100.00 at 8 decimals.
                deployCodeTo(
                    "ChainlinkPriceOracle.t.sol:MockAggregator",
                    abi.encode(uint8(8), int256(100e8)),
                    book.readAddress(string.concat(base, ".feed"))
                );
            }
            unchecked {
                ++i;
            }
        }

        harness = new Harness();
        // The script reads the router address from the listing, not from here; etching
        // code at the listed router is enough for construction to succeed.
        vm.etch(book.readAddress(".infra.swapRouter02"), hex"00");
        harness.configure(admin);
        harness.deployAll();
    }

    /// @dev Counts whatever the listing currently enables rather than a number typed
    ///      here, so trimming or adding a token is one edit, in the file that owns it.
    ///      Every disabled token must stay out of the registry.
    function test_deploysEveryEnabledTokenAndSkipsTheDisabledOne() public view {
        string memory book = vm.readFile("listings/4663.json");

        uint256 expected;
        uint256 i;
        while (vm.keyExistsJson(book, string.concat(".tokens[", vm.toString(i), "].symbol"))) {
            if (book.readBool(string.concat(".tokens[", vm.toString(i), "].enabled"))) ++expected;
            unchecked {
                ++i;
            }
        }

        assertGt(expected, 0, "listing enables nothing");
        assertEq(harness.tokenCount(), expected, "enabled token count");

        DeployProduction.Deployment memory d = harness.addresses();
        address[] memory supported = DividendRegistry(d.registry).supportedTokens();
        assertEq(supported.length, expected, "registered token count");

        // Nothing disabled may reach the registry: COIN, ORCL, CRWV and SNDK have no
        // USDG pool on mainnet, and SPCX has never traded.
        for (uint256 j = 0; j < i; ++j) {
            string memory base = string.concat(".tokens[", vm.toString(j), "]");
            if (book.readBool(string.concat(base, ".enabled"))) continue;
            address off = book.readAddress(string.concat(base, ".address"));
            for (uint256 k = 0; k < supported.length; ++k) {
                assertTrue(supported[k] != off, "disabled token was listed");
            }
        }
    }

    /// @dev Each feed's staleness bound comes from the listing, not one global figure.
    ///      A mainnet read showed feed ages spanning 0 to 74 minutes, so a single 1 hour
    ///      bound refuses live feeds in normal operation.
    function test_eachFeedGetsItsListedHeartbeat() public view {
        DeployProduction.Deployment memory d = harness.addresses();
        string memory book = vm.readFile("listings/4663.json");
        uint256 expected = book.readUint(".infra.defaultHeartbeat");
        assertGt(expected, 1 hours, "default heartbeat still at the too-tight 1 hour");

        (address token,,) = harness.tokenAt(0);
        (, , uint48 heartbeat) = ChainlinkPriceOracle(d.oracle).feedOf(token);
        assertEq(uint256(heartbeat), expected, "heartbeat wired from the listing");
    }

    /// @notice The read path the dashboard depends on.
    /// @dev The SDK prices every position by calling priceUsdg on the deployment's
    ///      swapAdapter. That is a public mapping on MockSwapAdapter, so it worked on
    ///      testnet by accident of the mock's shape; UniswapV3SwapAdapter had no such
    ///      function until it was added to ISwapAdapter. Without this, every position
    ///      and every token row on mainnet reverts.
    function test_swapAdapterAnswersPriceUsdgFromTheFeed() public view {
        DeployProduction.Deployment memory d = harness.addresses();
        (address token,,) = harness.tokenAt(0);

        // 100e8 at 8 feed decimals becomes 100e6 in the 6 decimal USDG quote.
        assertEq(UniswapV3SwapAdapter(d.adapter).priceUsdg(token), 100e6, "adapter price");
        assertEq(ChainlinkPriceOracle(d.oracle).priceUsdg(token), 100e6, "oracle price");
    }

    /// @dev A token with no registered feed must revert rather than price at zero.
    function test_priceRevertsForAnUnlistedToken() public {
        DeployProduction.Deployment memory d = harness.addresses();
        address stranger = makeAddr("unlisted");
        vm.expectRevert(abi.encodeWithSelector(ChainlinkPriceOracle.NoFeed.selector, stranger));
        UniswapV3SwapAdapter(d.adapter).priceUsdg(stranger);
    }

    /// @notice The deployer must walk away with nothing.
    /// @dev _assertDeployerHoldsNothing already fails the deploy if this is wrong; this
    ///      asserts it independently so a change to that helper cannot quietly pass.
    function test_deployerKeepsNoPowerAndAdminHoldsItAll() public view {
        DeployProduction.Deployment memory d = harness.addresses();
        address deployer = address(harness);

        assertEq(ChainlinkPriceOracle(d.oracle).owner(), admin, "oracle owner");
        assertEq(UniswapV3SwapAdapter(d.adapter).owner(), admin, "adapter owner");

        address[7] memory acl =
            [d.registry, d.vault, d.core, d.streamEngine, d.reinvestor, d.splitVault, d.lendingPool];
        for (uint256 i = 0; i < acl.length; ++i) {
            assertTrue(!DividendRegistry(acl[i]).hasRole(0x00, deployer), "deployer kept admin");
            assertTrue(DividendRegistry(acl[i]).hasRole(0x00, admin), "admin missing admin");
        }

        DividendRegistry registry = DividendRegistry(d.registry);
        assertTrue(registry.hasRole(registry.ORACLE_ROLE(), admin), "admin missing oracle role");
        assertTrue(!registry.hasRole(registry.ORACLE_ROLE(), deployer), "deployer kept oracle role");

        DripCore core = DripCore(d.core);
        assertTrue(core.hasRole(core.KEEPER_ROLE(), admin), "admin missing core keeper");
        assertTrue(!core.hasRole(core.KEEPER_ROLE(), deployer), "deployer kept core keeper");

        StreamEngine se = StreamEngine(d.streamEngine);
        assertTrue(se.hasRole(se.KEEPER_ROLE(), admin), "admin missing stream keeper");
        assertTrue(!se.hasRole(se.KEEPER_ROLE(), deployer), "deployer kept stream keeper");

        SplitVault sv = SplitVault(d.splitVault);
        assertTrue(sv.hasRole(sv.KEEPER_ROLE(), admin), "admin missing split keeper");
        assertTrue(!sv.hasRole(sv.KEEPER_ROLE(), deployer), "deployer kept split keeper");
    }

    /// @dev The module wiring, which must match Deploy.s.sol's or the protocol is
    ///      deployed but inert.
    function test_modulesAreWiredToEachOther() public view {
        DeployProduction.Deployment memory d = harness.addresses();

        assertEq(address(DripCore(d.core).streamEngine()), d.streamEngine, "core -> streamEngine");
        assertEq(address(DripCore(d.core).reinvestor()), d.reinvestor, "core -> reinvestor");
        assertEq(address(DripCore(d.core).swapAdapter()), d.adapter, "core -> adapter");
        assertEq(address(StreamEngine(d.streamEngine).reinvestor()), d.reinvestor, "streamEngine -> reinvestor");

        AdvanceVault vault = AdvanceVault(d.vault);
        assertTrue(vault.hasRole(vault.CORE_ROLE(), d.core), "vault CORE_ROLE core");
        assertTrue(vault.hasRole(vault.CORE_ROLE(), d.streamEngine), "vault CORE_ROLE streamEngine");
        assertTrue(StreamEngine(d.streamEngine).hasRole(StreamEngine(d.streamEngine).CORE_ROLE(), d.core), "se CORE_ROLE");
        assertTrue(Reinvestor(d.reinvestor).hasRole(Reinvestor(d.reinvestor).CORE_ROLE(), d.core), "reinvestor CORE_ROLE core");
        assertTrue(
            Reinvestor(d.reinvestor).hasRole(Reinvestor(d.reinvestor).CORE_ROLE(), d.streamEngine),
            "reinvestor CORE_ROLE streamEngine"
        );
        assertTrue(DripCore(d.core).hasRole(DripCore(d.core).REINVESTOR_ROLE(), d.reinvestor), "core REINVESTOR_ROLE");
        assertTrue(
            DividendRegistry(d.registry).hasRole(DividendRegistry(d.registry).SETTLER_ROLE(), d.core),
            "registry SETTLER_ROLE"
        );
    }

    /// @dev Every protocol contract must settle in the chain's real USDG, not a mock.
    function test_everyModulePointsAtTheListedUsdg() public view {
        DeployProduction.Deployment memory d = harness.addresses();
        address usdg = harness.usdgAddress();

        assertEq(address(AdvanceVault(d.vault).asset()), usdg, "vault asset");
        assertEq(UniswapV3SwapAdapter(d.adapter).usdg(), usdg, "adapter usdg");
    }

    /// @dev The credit side must come up wired, or Borrow is dead on arrival.
    function test_lendingPoolIsWiredAndOwnedByAdmin() public view {
        DeployProduction.Deployment memory d = harness.addresses();
        LendingPool pool = LendingPool(d.lendingPool);

        assertEq(address(DripCore(d.core).lendingPool()), d.lendingPool, "core -> lendingPool");
        assertTrue(DripCore(d.core).hasRole(DripCore(d.core).LENDER_ROLE(), d.lendingPool), "core LENDER_ROLE");
        assertTrue(AdvanceVault(d.vault).hasRole(AdvanceVault(d.vault).LENDER_ROLE(), d.lendingPool), "vault LENDER_ROLE");
        assertTrue(pool.hasRole(pool.CORE_ROLE(), d.core), "pool CORE_ROLE");

        // Section 13's opening parameters, as deployed.
        assertEq(pool.maxLtvBps(), 4_000, "max LTV");
        assertEq(pool.liquidationThresholdBps(), 6_500, "liq threshold");
        assertEq(pool.liquidationBonusBps(), 500, "bonus");
        assertEq(pool.closeFactorBps(), 5_000, "close factor");
        assertEq(pool.borrowRateBps(), 200, "base rate at zero utilisation");

        // It prices from Chainlink, not from the venue it would liquidate through.
        assertEq(address(pool.priceOracle()), d.oracle, "pool prices from the oracle");
    }

    /// @dev Nothing declared. A mainnet calendar comes from the real dividend source.
    function test_calendarStartsEmpty() public view {
        DeployProduction.Deployment memory d = harness.addresses();
        assertEq(DividendRegistry(d.registry).dividendCount(), 0, "calendar not empty");
    }
}
