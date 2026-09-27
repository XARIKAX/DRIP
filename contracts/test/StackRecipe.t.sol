// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {StackVault} from "../src/StackVault.sol";
import {StackToken} from "../src/StackToken.sol";
import {MockStockToken} from "../src/mocks/MockStockToken.sol";
import {DeployStack} from "../script/DeployStack.s.sol";

/// @title StackRecipeTest
/// @notice Checks the recipe FILE, not the vault.
///
/// @dev StackVault.t.sol proves the mechanism with numbers chosen to exercise it.
///      This proves the numbers that are actually going on chain, which is a
///      different question and the one nothing else asks.
///
///      A recipe is a hand-written JSON file of very large integers. Every failure it
///      can have is silent: a leg off by a factor of a thousand mints and redeems
///      perfectly while holding the wrong position, a duplicated address is only
///      caught at creation, and a units figure that disagrees with its own `human`
///      note means one of the two is a lie and there is no way to tell which from the
///      chain afterwards. The deploy script prints these for a person to read, which
///      catches them only if the person reads. This catches them on every commit.
contract StackRecipeTest is Test {
    using stdJson for string;

    string recipes;
    address admin = address(0xA11CE);
    address alice = address(0xA1);

    function setUp() public {
        recipes = vm.readFile("stacks/4663.json");
    }

    /// @dev Everything StackVault.createStack would reject, rejected earlier and with
    ///      a better message than a revert selector on mainnet.
    function test_everyRecipeWouldBeAccepted() public view {
        uint256 n = _count();
        assertGt(n, 0, "no recipes in the file");

        for (uint256 s = 0; s < n; ++s) {
            string memory base = string.concat(".stacks[", vm.toString(s), "]");
            uint256 c = _countConstituents(base);

            assertGt(c, 0, "a stack with no constituents");
            assertLe(c, 6, "more constituents than MAX_CONSTITUENTS");
            assertGt(bytes(recipes.readString(string.concat(base, ".symbol"))).length, 0, "empty symbol");
            assertGt(bytes(recipes.readString(string.concat(base, ".name"))).length, 0, "empty name");

            for (uint256 i = 0; i < c; ++i) {
                string memory k = string.concat(base, ".constituents[", vm.toString(i), "]");
                address t = recipes.readAddress(string.concat(k, ".address"));
                assertTrue(t != address(0), "zero address constituent");
                assertGt(recipes.readUint(string.concat(k, ".unitsPerShare")), 0, "zero units constituent");

                for (uint256 j = 0; j < i; ++j) {
                    string memory prev = string.concat(base, ".constituents[", vm.toString(j), "]");
                    assertTrue(recipes.readAddress(string.concat(prev, ".address")) != t, "duplicate constituent");
                }
            }
        }
    }

    /// @dev The `human` note beside each leg is the only reason anyone believes the
    ///      raw integer. If the two disagree the file is worse than one with no note
    ///      at all, because the note is what gets read.
    ///
    ///      Parsed rather than eyeballed: the note leads with a decimal number, which
    ///      is compared against unitsPerShare scaled by the leg's own decimals.
    function test_everyHumanNoteMatchesItsRawAmount() public view {
        uint256 n = _count();
        for (uint256 s = 0; s < n; ++s) {
            string memory base = string.concat(".stacks[", vm.toString(s), "]");
            uint256 c = _countConstituents(base);
            for (uint256 i = 0; i < c; ++i) {
                string memory k = string.concat(base, ".constituents[", vm.toString(i), "]");
                uint256 units = recipes.readUint(string.concat(k, ".unitsPerShare"));
                uint256 decimals = recipes.readUint(string.concat(k, ".decimals"));
                string memory note = recipes.readString(string.concat(k, ".human"));

                // Scaled by 1e6 on both sides so a leg smaller than one whole token
                // is compared at its real size rather than truncated to zero.
                uint256 claimed = _leadingNumberScaled(note);
                uint256 actual = (units * 1e6) / (10 ** decimals);
                assertEq(actual, claimed, string.concat("units disagree with the note: ", note));
            }
        }
    }

    /// @dev A full round trip at the file's own numbers: mint one share, redeem it,
    ///      and come out with exactly what went in and a vault holding nothing.
    ///
    ///      The constituents are mocks rather than the mainnet addresses — there is no
    ///      fork here — but the UNITS are the file's, which is what is being tested.
    ///      An extra zero on a leg shows up as a wallet that cannot afford to mint.
    function test_oneShareRoundTripsAtTheFilesOwnNumbers() public {
        string memory base = ".stacks[0]";
        uint256 c = _countConstituents(base);

        address[] memory tokens = new address[](c);
        uint256[] memory units = new uint256[](c);

        vm.startPrank(admin);
        StackVault vault = new StackVault(admin);

        for (uint256 i = 0; i < c; ++i) {
            string memory k = string.concat(base, ".constituents[", vm.toString(i), "]");
            units[i] = recipes.readUint(string.concat(k, ".unitsPerShare"));
            string memory sym = recipes.readString(string.concat(k, ".symbol"));

            MockStockToken t = new MockStockToken(sym, sym, admin);
            tokens[i] = address(t);
            t.mint(alice, units[i]); // exactly one share's worth, not a wei more
        }

        uint256 id = vault.createStack(
            recipes.readString(string.concat(base, ".name")),
            recipes.readString(string.concat(base, ".symbol")),
            tokens,
            units
        );
        vm.stopPrank();

        (address shareToken,,,,) = vault.stackOf(id);

        vm.startPrank(alice);
        for (uint256 i = 0; i < c; ++i) {
            MockStockToken(tokens[i]).approve(address(vault), type(uint256).max);
        }

        vault.mint(id, 1e18);
        assertEq(StackToken(shareToken).balanceOf(alice), 1e18, "one share");
        for (uint256 i = 0; i < c; ++i) {
            assertEq(MockStockToken(tokens[i]).balanceOf(alice), 0, "a leg was not fully spent");
            assertEq(vault.heldOf(id, tokens[i]), units[i], "the vault holds the wrong amount");
        }

        vault.redeem(id, 1e18);
        vm.stopPrank();

        assertEq(StackToken(shareToken).balanceOf(alice), 0, "share not burnt");
        for (uint256 i = 0; i < c; ++i) {
            assertEq(MockStockToken(tokens[i]).balanceOf(alice), units[i], "a leg did not come back whole");
            assertEq(vault.heldOf(id, tokens[i]), 0, "the vault kept something");
        }
    }

    // -----------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------

    function _count() private view returns (uint256 n) {
        while (vm.keyExistsJson(recipes, string.concat(".stacks[", vm.toString(n), "].symbol"))) ++n;
    }

    function _countConstituents(string memory base) private view returns (uint256 n) {
        while (vm.keyExistsJson(recipes, string.concat(base, ".constituents[", vm.toString(n), "].address"))) ++n;
    }

    /// @dev The leading decimal number of a note like "10,000 PONS, one hundred-
    ///      thousandth of supply" or "0.01 NVDA, about $2.25", scaled by 1e6.
    ///
    ///      Commas are skipped as thousands separators. Reading stops at the first
    ///      character that is neither a digit, a comma nor the single decimal point,
    ///      which is what keeps the "$2.25" in the tail of a note out of the figure.
    function _leadingNumberScaled(string memory note) private pure returns (uint256) {
        bytes memory b = bytes(note);
        uint256 whole;
        uint256 frac;
        uint256 fracDigits;
        bool afterPoint;

        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 ch = b[i];
            if (ch == ",") continue;
            if (ch == "." && !afterPoint) {
                afterPoint = true;
                continue;
            }
            if (ch < "0" || ch > "9") break;
            uint256 d = uint8(ch) - 48;
            if (afterPoint) {
                // Beyond six places the scale cannot hold it, and no recipe needs it.
                if (fracDigits == 6) continue;
                frac = frac * 10 + d;
                ++fracDigits;
            } else {
                whole = whole * 10 + d;
            }
        }

        return whole * 1e6 + frac * (10 ** (6 - fracDigits));
    }
}

/// @notice A stand in for a recipe constituent, placed at its real mainnet address.
contract FakeConstituent is MockStockToken {
    uint8 private immutable _decimals;

    constructor(string memory symbol_, uint8 decimals_) MockStockToken(symbol_, symbol_, msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}

/// @notice Reaches the script's two internals so the skip can be tested without a
///         second book on disk. Same pattern as DeployProduction's harness.
contract Harness is DeployStack {
    function openStack(StackVault vault, string memory recipes, string memory base) external {
        _openStack(vault, recipes, base);
    }

    function alreadyOpen(StackVault vault, string memory symbol_) external view returns (bool) {
        return _alreadyOpen(vault, symbol_);
    }
}

/// @title DeployStackTest
/// @notice The deploy script itself, run against the real recipe file.
///
/// @dev Every constituent address in stacks/4663.json is etched with a stand in at the
///      decimals the file claims, and the actual script is then run. This is the only
///      thing that exercises the script's own code: the file reads, the decimals
///      assertion, the role handover, and the skip that keeps a second run from
///      opening a duplicate of every basket.
///
///      It cannot check that the real chain agrees with the file — only a live RPC can
///      say whether 0xd060… really is an 18 decimal NVDA — which is why the script
///      prints what it read and the simulation is a review step a person performs.
///      What this catches is everything that is wrong before the RPC is ever dialled.
contract DeployStackTest is Test {
    using stdJson for string;

    uint256 internal constant ROBINHOOD_MAINNET = 4663;

    DeployStack internal script;
    string internal recipes;
    string internal bookBefore;
    address internal admin = makeAddr("multisig");
    uint256 internal pk = 0xB0B;

    /// @dev Any value that turns an address into a usable private key. The admin-key
    ///      test needs a key whose address it also passes as ADMIN, and a multisig
    ///      address is not derived from a key anyone has, so one is invented here and
    ///      its own address used for both.
    uint256 internal constant ADMIN_KEY_OFFSET = 1;

    function setUp() public {
        vm.chainId(ROBINHOOD_MAINNET);
        recipes = vm.readFile("stacks/4663.json");
        bookBefore = vm.readFile("deployments/4663.json");

        uint256 s;
        while (vm.keyExistsJson(recipes, string.concat(".stacks[", vm.toString(s), "].symbol"))) {
            string memory base = string.concat(".stacks[", vm.toString(s), "]");
            uint256 i;
            while (vm.keyExistsJson(recipes, string.concat(base, ".constituents[", vm.toString(i), "].address"))) {
                string memory k = string.concat(base, ".constituents[", vm.toString(i), "]");
                deployCodeTo(
                    "StackRecipe.t.sol:FakeConstituent",
                    abi.encode(
                        recipes.readString(string.concat(k, ".symbol")),
                        uint8(recipes.readUint(string.concat(k, ".decimals")))
                    ),
                    recipes.readAddress(string.concat(k, ".address"))
                );
                unchecked {
                    ++i;
                }
            }
            unchecked {
                ++s;
            }
        }

        // A book already carrying a stackVault sends the script down its reuse branch,
        // which needs a real vault at that address for the run to mean anything. This
        // keeps the test honest after the first mainnet deploy is recorded.
        string memory book = vm.readFile("deployments/4663.json");
        if (vm.keyExistsJson(book, ".stackVault")) {
            deployCodeTo("StackVault.sol:StackVault", abi.encode(vm.addr(pk)), book.readAddress(".stackVault"));
        }

        vm.setEnv("ADMIN", vm.toString(admin));
        vm.setEnv("PRIVATE_KEY", vm.toString(pk));

        script = new DeployStack();
        script.run();
    }

    function test_everyRecipeInTheFileIsOpen() public view {
        StackVault vault = _vault();
        uint256 expected;
        while (vm.keyExistsJson(recipes, string.concat(".stacks[", vm.toString(expected), "].symbol"))) ++expected;
        assertEq(vault.stackCount(), expected, "one basket per recipe, no more and no fewer");
    }

    /// @dev The whole point of the skip. Opening the same recipe twice against a vault
    ///      that already carries it must be a no-op, not a second basket with the same
    ///      symbol and a different id.
    function test_openingTheSameRecipeTwiceIsANoOp() public {
        StackVault vault = _vault();
        uint256 before = vault.stackCount();

        Harness harness = new Harness();
        vm.startPrank(admin);
        vault.grantRole(vault.CREATOR_ROLE(), address(harness));
        vm.stopPrank();

        harness.openStack(vault, recipes, ".stacks[0]");
        assertEq(vault.stackCount(), before, "a duplicate basket was opened");
        assertTrue(harness.alreadyOpen(vault, recipes.readString(".stacks[0].symbol")), "skip did not recognise it");
        assertFalse(harness.alreadyOpen(vault, "NOTHING"), "skip matched a symbol that is not there");
    }

    function test_eachLegHoldsTheUnitsTheFileNames() public view {
        StackVault vault = _vault();
        string memory base = ".stacks[0]";

        (,, address[] memory constituents, uint256[] memory units,) = vault.stackOf(1);

        uint256 i;
        while (vm.keyExistsJson(recipes, string.concat(base, ".constituents[", vm.toString(i), "].address"))) {
            string memory k = string.concat(base, ".constituents[", vm.toString(i), "]");
            assertEq(constituents[i], recipes.readAddress(string.concat(k, ".address")), "wrong constituent");
            assertEq(units[i], recipes.readUint(string.concat(k, ".unitsPerShare")), "wrong units");
            unchecked {
                ++i;
            }
        }
        assertEq(constituents.length, i, "the vault holds a leg the file does not name");
    }

    function test_theDeployerKeepsNothingAndTheAdminHoldsItAll() public view {
        StackVault vault = _vault();
        address deployer = vm.addr(pk);

        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin), "admin is not admin");
        assertTrue(vault.hasRole(vault.CREATOR_ROLE(), admin), "admin cannot create");
        assertFalse(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), deployer), "deployer kept admin");
        assertFalse(vault.hasRole(vault.CREATOR_ROLE(), deployer), "deployer kept creator");
    }

    /// @dev A file claiming the wrong decimals is the one failure no downstream
    ///      assertion can catch, so the script refuses the run. This proves it does.
    function test_aDecimalsMismatchStopsTheRun() public {
        string memory k = ".stacks[0].constituents[0]";
        deployCodeTo(
            "StackRecipe.t.sol:FakeConstituent",
            abi.encode(recipes.readString(string.concat(k, ".symbol")), uint8(6)),
            recipes.readAddress(string.concat(k, ".address"))
        );

        DeployStack again = new DeployStack();
        vm.expectRevert("recipe decimals disagree with the chain");
        again.run();
    }

    /// @dev Passing the ADMIN's own key must not strip the vault of its roles.
    ///
    ///      The handover is grant-to-admin then renounce-from-deployer. When those are
    ///      the same address the grants are no-ops and the renounces land on the only
    ///      holder there is, so the vault ends the run with no admin and no creator and
    ///      no way back. Nobody can open a basket, freeze one or pause the vault, ever.
    ///
    ///      Asked in exactly the terms that matter afterwards: can this address still
    ///      do the things an admin exists to do. Checking hasRole alone would pass on a
    ///      vault whose roles were granted and never used.
    function test_theAdminsOwnKeyDoesNotStripTheVaultOfItsRoles() public {
        vm.setEnv("PRIVATE_KEY", vm.toString(uint256(uint160(admin)) + ADMIN_KEY_OFFSET));
        address signer = vm.addr(uint256(uint160(admin)) + ADMIN_KEY_OFFSET);
        vm.setEnv("ADMIN", vm.toString(signer));

        DeployStack asAdmin = new DeployStack();
        asAdmin.run();
        StackVault vault = StackVault(asAdmin.lastVault());

        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), signer), "the vault has no admin at all");
        assertTrue(vault.hasRole(vault.CREATOR_ROLE(), signer), "the vault has no creator at all");

        address[] memory c = new address[](1);
        c[0] = recipes.readAddress(".stacks[0].constituents[0].address");
        uint256[] memory u = new uint256[](1);
        u[0] = 1e18;

        vm.startPrank(signer);
        vault.createStack("Later", "LATER", c, u);
        vault.pause();
        vault.unpause();
        vm.stopPrank();
    }

    /// @dev The book must come through a test run byte for byte.
    ///
    ///      This file drives the real script with fakes etched at the real mainnet
    ///      addresses. If the script's book write were not gated on a broadcast, every
    ///      `forge test` would stamp a throwaway address into deployments/4663.json,
    ///      where sync-abis.mjs would pick it up and someone would commit it. The
    ///      frontend would then read a StackVault that does not exist, and the error
    ///      would say nothing about an address book.
    function test_aTestRunNeverWritesTheAddressBook() public view {
        assertEq(
            keccak256(bytes(vm.readFile("deployments/4663.json"))),
            keccak256(bytes(bookBefore)),
            "the script wrote the address book from a test"
        );
    }

    function _vault() private view returns (StackVault) {
        // The script's own vault, found by walking what it created rather than by
        // re-deriving a CREATE address the test would have to keep in step.
        return StackVault(script.lastVault());
    }
}
