// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
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
import {Mode} from "../src/interfaces/DripTypes.sol";

/// @title DripTestBase
/// @notice Deploys and wires the whole protocol exactly the way the deploy script does.
/// @dev If the wiring here and the wiring in script/Deploy.s.sol ever drift, the tests
///      stop testing what ships. Keep them in step.
abstract contract DripTestBase is Test {
    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal lp = makeAddr("lp");

    MockUSDG internal usdg;
    MockStockToken internal aapl;
    MockStockToken internal ko;
    MockSwapAdapter internal adapter;
    DividendRegistry internal registry;
    AdvanceVault internal vault;
    DripCore internal core;
    StreamEngine internal stream;
    Reinvestor internal reinvestor;

    /// @dev AAPL priced at 220 USDG, KO at 62 USDG. Six decimal quote, 18 decimal token.
    uint256 internal constant AAPL_PRICE = 220e6;
    uint256 internal constant KO_PRICE = 62e6;

    function setUp() public virtual {
        vm.warp(1_756_000_000);

        vm.startPrank(admin);
        usdg = new MockUSDG(admin);
        aapl = new MockStockToken("Apple Inc Stock Token", "AAPL", admin);
        ko = new MockStockToken("Coca Cola Co Stock Token", "KO", admin);

        registry = new DividendRegistry(admin);
        vault = new AdvanceVault(IERC20(address(usdg)), admin);
        core = new DripCore(IDividendRegistry(address(registry)), IAdvanceVault(address(vault)), IERC20(address(usdg)), admin);
        stream = new StreamEngine(IAdvanceVault(address(vault)), IERC20(address(usdg)), admin);
        adapter = new MockSwapAdapter(address(usdg), admin);
        reinvestor = new Reinvestor(
            IERC20(address(usdg)), IDripCore(address(core)), ISwapAdapter(address(adapter)), admin
        );

        // Wire the modules.
        core.setStreamEngine(IStreamEngine(address(stream)));
        core.setReinvestor(IReinvestor(address(reinvestor)));
        core.setSwapAdapter(ISwapAdapter(address(adapter)));
        stream.setReinvestor(IReinvestor(address(reinvestor)));

        // Roles. Only protocol contracts may move protocol money.
        vault.grantRole(vault.CORE_ROLE(), address(core));
        vault.grantRole(vault.CORE_ROLE(), address(stream));
        stream.grantRole(stream.CORE_ROLE(), address(core));
        stream.grantRole(stream.KEEPER_ROLE(), keeper);
        reinvestor.grantRole(reinvestor.CORE_ROLE(), address(stream));
        reinvestor.grantRole(reinvestor.CORE_ROLE(), address(core));
        core.grantRole(core.REINVESTOR_ROLE(), address(reinvestor));
        core.grantRole(core.KEEPER_ROLE(), keeper);
        registry.grantRole(registry.SETTLER_ROLE(), address(core));

        // Prices and swap inventory so the reinvest loop can actually fill.
        adapter.setPrice(address(aapl), AAPL_PRICE);
        adapter.setPrice(address(ko), KO_PRICE);
        aapl.mint(address(adapter), 1_000_000e18);
        ko.mint(address(adapter), 1_000_000e18);

        // Balances.
        aapl.mint(alice, 1_000e18);
        aapl.mint(bob, 1_000e18);
        ko.mint(alice, 1_000e18);
        usdg.mint(lp, 5_000_000e6);
        usdg.mint(keeper, 5_000_000e6);
        usdg.mint(admin, 5_000_000e6);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /// @dev Seed the vault with LP capital so advances can be booked.
    function fundVault(uint256 assets) internal {
        vm.startPrank(lp);
        usdg.approve(address(vault), assets);
        vault.deposit(assets, lp);
        vm.stopPrank();
    }

    /// @dev Deposit stock into DripCore for a user.
    function depositStock(address user, MockStockToken token, uint256 amount) internal {
        vm.startPrank(user);
        token.approve(address(core), amount);
        core.deposit(address(token), amount);
        vm.stopPrank();
    }

    /// @dev Declare a dividend starting `exIn` seconds from now, paying `window` later.
    function declare(MockStockToken token, uint256 amountPerToken, uint64 exIn, uint64 window)
        internal
        returns (uint256 id)
    {
        vm.prank(admin);
        id = registry.declareDividend(
            address(token), amountPerToken, uint64(block.timestamp) + exIn, uint64(block.timestamp) + exIn + window
        );
    }

    /// @dev Pay a dividend in full from the keeper's pocket.
    function settle(uint256 dividendId) internal {
        uint256 owed = core.totalEntitlementFor(dividendId);
        vm.startPrank(keeper);
        usdg.approve(address(core), owed);
        core.settleDividend(dividendId);
        vm.stopPrank();
    }

    /// @dev The accounting identity the vault must always satisfy.
    function assertVaultSolvent() internal view {
        assertGe(vault.cash(), vault.obligations(), "cash below obligations");
        uint256 assets = vault.totalAssets();
        if (assets > 0) {
            assertLe(vault.utilizationBps(), vault.maxUtilizationBps(), "utilisation above cap");
        }
    }
}
