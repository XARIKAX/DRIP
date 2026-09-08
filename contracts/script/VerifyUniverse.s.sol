// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IAggregatorV3} from "../src/adapters/ChainlinkPriceOracle.sol";

/// @notice The QuoterV2 surface the verification needs.
interface IQuoterV2 {
    function quoteExactInput(bytes memory path, uint256 amountIn)
        external
        returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory ticksCrossedList, uint256 gasEstimate);
}

/// @title VerifyUniverse
/// @notice Verify the whole listing universe onchain before wiring a single token.
///         Hard-fails on any mismatch. Nothing gets listed on trust.
/// @dev The listing rules, executed:
///
///        forge script script/VerifyUniverse.s.sol --rpc-url robinhood_mainnet
///
///      For every enabled token in listings/<chainid>.json:
///        1. token symbol() matches the config and decimals() == 18
///        2. the Chainlink feed answers: 8 decimals, description read, and
///           latestRoundData() fresh inside THAT FEED'S heartbeat with answer > 0.
///           The heartbeat is read from the listing, so this check and the oracle
///           the deploy wires enforce one number rather than two.
///        3. the full route WETH -3000-> USDG -3000-> token quotes through QuoterV2,
///           and so does the USDG -3000-> token leg the reinvestor actually swaps
///        4. the quoted output is sanity-bounded against the Chainlink price
///           (the minOut rule: bound the FINAL token, never the mid leg)
///
///      Read-only. Run it before every wiring change and after every listing edit.
contract VerifyUniverse is Script {
    using stdJson for string;

    /// @dev Used only when a listing names no heartbeat at all. Matches
    ///      ChainlinkPriceOracle.DEFAULT_HEARTBEAT, which applies in the same case.
    uint256 internal constant FALLBACK_HEARTBEAT = 1 hours;
    /// @dev Not a bound. A feed inside its heartbeat but past this gets a SLOW line,
    ///      because a feed decaying towards its bound is worth seeing before it crosses.
    uint256 internal constant SLOW_FEED_AGE = 1 hours;
    /// @dev Quoted output may differ from the Chainlink mid by fees and depth, not by much.
    uint256 internal constant MAX_DEVIATION_BPS = 500;

    /// @dev The chain level addresses every token is checked against. Carried as one
    ///      value because the checks need all of it and the stack does not stretch.
    struct Infra {
        address weth;
        address usdg;
        IQuoterV2 quoter;
        uint24 fee;
        uint256 defaultHeartbeat;
    }

    uint256 internal failures;

    function run() external {
        string memory path = string.concat("listings/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);

        Infra memory infra = Infra({
            weth: book.readAddress(".infra.weth"),
            usdg: book.readAddress(".infra.usdg"),
            quoter: IQuoterV2(book.readAddress(".infra.quoterV2")),
            fee: uint24(book.readUint(".infra.defaultFeeTier")),
            defaultHeartbeat: vm.keyExistsJson(book, ".infra.defaultHeartbeat")
                ? book.readUint(".infra.defaultHeartbeat")
                : FALLBACK_HEARTBEAT
        });

        uint256 count = countTokens(book);
        console2.log("Verifying universe:", count, "tokens on chain", block.chainid);

        for (uint256 i = 0; i < count; ++i) {
            verifyEntry(book, string.concat(".tokens[", vm.toString(i), "]"), infra);
        }

        if (failures > 0) {
            console2.log("FAILURES:", failures);
            revert("universe verification failed");
        }
        console2.log("Universe verified clean.");
    }

    /// @dev One listing entry, read and checked. Split from the loop so the reads and
    ///      the checks do not share a stack frame.
    function verifyEntry(string memory book, string memory base, Infra memory infra) internal {
        string memory symbol = book.readString(string.concat(base, ".symbol"));
        if (!book.readBool(string.concat(base, ".enabled"))) {
            console2.log(string.concat("SKIP  ", symbol, " (disabled by listing config)"));
            return;
        }

        string memory hbKey = string.concat(base, ".heartbeat");
        verifyToken(
            symbol,
            book.readAddress(string.concat(base, ".address")),
            book.readAddress(string.concat(base, ".feed")),
            vm.keyExistsJson(book, hbKey) ? book.readUint(hbKey) : infra.defaultHeartbeat,
            infra
        );
    }

    function verifyToken(
        string memory symbol,
        address token,
        address feed,
        uint256 heartbeat,
        Infra memory infra
    ) internal {
        if (!checkToken(symbol, token)) return;
        int256 answer = checkFeed(symbol, feed, heartbeat);
        if (answer <= 0) return;
        if (!checkRoutes(symbol, token, infra, uint256(answer))) return;
        console2.log(string.concat("OK    ", symbol));
    }

    /// @dev 1. Token identity: symbol matches, 18 decimals.
    function checkToken(string memory symbol, address token) internal returns (bool) {
        try IERC20Metadata(token).symbol() returns (string memory onchainSymbol) {
            if (keccak256(bytes(onchainSymbol)) != keccak256(bytes(symbol))) {
                fail(symbol, string.concat("symbol mismatch, onchain says ", onchainSymbol));
                return false;
            }
        } catch {
            fail(symbol, "token symbol() reverted");
            return false;
        }
        if (IERC20Metadata(token).decimals() != 18) {
            fail(symbol, "token decimals not 18");
            return false;
        }
        return true;
    }

    /// @dev 2. Feed identity and liveness. No feed, no listing; stale feed, no listing.
    ///      Stale means past THIS feed's heartbeat, the same number
    ///      ChainlinkPriceOracle will refuse to price on once the deploy wires it.
    ///      The age is printed either way: passing is not the same as fresh, and a
    ///      feed drifting towards its bound should be visible before it crosses.
    ///      Returns the fresh answer, or zero on failure.
    function checkFeed(string memory symbol, address feed, uint256 heartbeat) internal returns (int256) {
        IAggregatorV3 agg = IAggregatorV3(feed);
        if (agg.decimals() != 8) {
            fail(symbol, "feed decimals not 8");
            return 0;
        }
        console2.log(string.concat("  feed: ", agg.description()));
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = agg.latestRoundData();
        if (answer <= 0 || answeredInRound < roundId || updatedAt == 0) {
            fail(symbol, "feed bad answer or incomplete round");
            return 0;
        }

        // A feed stamped ahead of the chain is not fresh, it is unreadable: the oracle
        // computes the same subtraction and panics on the underflow. That fails closed,
        // so it is safe, but reporting it as age zero here would pass a token the oracle
        // then refuses to price. Refuse it in the same place instead.
        if (updatedAt > block.timestamp) {
            fail(symbol, "feed timestamped ahead of the chain; the oracle cannot read it");
            return 0;
        }

        uint256 age = block.timestamp - updatedAt;
        console2.log("  age (min):", age / 60, " heartbeat (min):", heartbeat / 60);
        if (age > heartbeat) {
            fail(symbol, "feed stale past its heartbeat");
            return 0;
        }
        if (age > SLOW_FEED_AGE) {
            console2.log(string.concat("  SLOW  ", symbol, " - inside its heartbeat but over an hour old"));
        }
        return answer;
    }

    /// @dev 3 and 4. Both routes quote, and the reinvest leg's output is bounded
    ///      against the Chainlink price. The FINAL token, never the mid leg.
    function checkRoutes(string memory symbol, address token, Infra memory infra, uint256 answer)
        internal
        returns (bool)
    {
        try infra.quoter.quoteExactInput(
            abi.encodePacked(infra.weth, infra.fee, infra.usdg, infra.fee, token), 1 ether
        ) returns (
            uint256 outFull, uint160[] memory, uint32[] memory, uint256
        ) {
            if (outFull == 0) {
                fail(symbol, "full route quoted zero");
                return false;
            }
        } catch {
            fail(symbol, "full route does not quote");
            return false;
        }

        uint256 usdgIn = 1_000e6;
        uint256 outLeg;
        try infra.quoter.quoteExactInput(abi.encodePacked(infra.usdg, infra.fee, token), usdgIn) returns (
            uint256 out, uint160[] memory, uint32[] memory, uint256
        ) {
            outLeg = out;
        } catch {
            fail(symbol, "USDG leg does not quote");
            return false;
        }

        // expected tokens out = usdgIn(6dp) * 1e18 / price(6dp from the 8dp feed)
        uint256 expected = (usdgIn * 1e18) / (answer / 100);
        uint256 deviation = outLeg > expected
            ? ((outLeg - expected) * 10_000) / expected
            : ((expected - outLeg) * 10_000) / expected;
        if (deviation > MAX_DEVIATION_BPS) {
            console2.log("  quoted:", outLeg);
            console2.log("  chainlink expected:", expected);
            fail(symbol, "quote deviates from Chainlink beyond bounds");
            return false;
        }
        return true;
    }

    function fail(string memory symbol, string memory reason) internal {
        failures++;
        console2.log(string.concat("FAIL  ", symbol, " - ", reason));
    }

    /// @dev stdJson has no array length helper; probe until a missing key.
    function countTokens(string memory book) internal view returns (uint256 n) {
        while (true) {
            string memory key = string.concat(".tokens[", vm.toString(n), "].symbol");
            if (!vm.keyExistsJson(book, key)) break;
            ++n;
        }
    }
}
