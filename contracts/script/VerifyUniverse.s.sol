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
///           latestRoundData() fresh inside the 1 hour heartbeat with answer > 0
///        3. the full route WETH -3000-> USDG -3000-> token quotes through QuoterV2,
///           and so does the USDG -3000-> token leg the reinvestor actually swaps
///        4. the quoted output is sanity-bounded against the Chainlink price
///           (the minOut rule: bound the FINAL token, never the mid leg)
///
///      Read-only. Run it before every wiring change and after every listing edit.
contract VerifyUniverse is Script {
    using stdJson for string;

    uint256 internal constant HEARTBEAT = 1 hours;
    /// @dev Quoted output may differ from the Chainlink mid by fees and depth, not by much.
    uint256 internal constant MAX_DEVIATION_BPS = 500;

    uint256 internal failures;

    function run() external {
        string memory path = string.concat("listings/", vm.toString(block.chainid), ".json");
        string memory book = vm.readFile(path);

        address weth = book.readAddress(".infra.weth");
        address usdg = book.readAddress(".infra.usdg");
        IQuoterV2 quoter = IQuoterV2(book.readAddress(".infra.quoterV2"));
        uint24 fee = uint24(book.readUint(".infra.defaultFeeTier"));

        uint256 count = countTokens(book);
        console2.log("Verifying universe:", count, "tokens on chain", block.chainid);

        for (uint256 i = 0; i < count; ++i) {
            string memory base = string.concat(".tokens[", vm.toString(i), "]");
            string memory symbol = book.readString(string.concat(base, ".symbol"));
            bool enabled = book.readBool(string.concat(base, ".enabled"));
            if (!enabled) {
                console2.log(string.concat("SKIP  ", symbol, " (disabled by listing config)"));
                continue;
            }
            address token = book.readAddress(string.concat(base, ".address"));
            address feed = book.readAddress(string.concat(base, ".feed"));
            verifyToken(symbol, token, feed, weth, usdg, quoter, fee);
        }

        if (failures > 0) {
            console2.log("FAILURES:", failures);
            revert("universe verification failed");
        }
        console2.log("Universe verified clean.");
    }

    function verifyToken(
        string memory symbol,
        address token,
        address feed,
        address weth,
        address usdg,
        IQuoterV2 quoter,
        uint24 fee
    ) internal {
        if (!checkToken(symbol, token)) return;
        int256 answer = checkFeed(symbol, feed);
        if (answer <= 0) return;
        if (!checkRoutes(symbol, token, weth, usdg, quoter, fee, uint256(answer))) return;
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
    ///      Returns the fresh answer, or zero on failure.
    function checkFeed(string memory symbol, address feed) internal returns (int256) {
        IAggregatorV3 agg = IAggregatorV3(feed);
        if (agg.decimals() != 8) {
            fail(symbol, "feed decimals not 8");
            return 0;
        }
        console2.log(string.concat("  feed: ", agg.description()));
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = agg.latestRoundData();
        if (answer <= 0 || answeredInRound < roundId || updatedAt == 0 || block.timestamp - updatedAt > HEARTBEAT) {
            fail(symbol, "feed stale or bad answer");
            return 0;
        }
        return answer;
    }

    /// @dev 3 and 4. Both routes quote, and the reinvest leg's output is bounded
    ///      against the Chainlink price. The FINAL token, never the mid leg.
    function checkRoutes(
        string memory symbol,
        address token,
        address weth,
        address usdg,
        IQuoterV2 quoter,
        uint24 fee,
        uint256 answer
    ) internal returns (bool) {
        try quoter.quoteExactInput(abi.encodePacked(weth, fee, usdg, fee, token), 1 ether) returns (
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
        try quoter.quoteExactInput(abi.encodePacked(usdg, fee, token), usdgIn) returns (
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
