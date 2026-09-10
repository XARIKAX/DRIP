// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockStockToken
/// @notice TESTNET ONLY. Stands in for a Robinhood Chain stock token.
/// @dev Production replaces this with the real self custodiable stock token. The
///      protocol only ever calls transfer, transferFrom, balanceOf and decimals on
///      it, so any standard 18 decimal ERC-20 drops in with no contract changes.
///      Nothing here is deployed to mainnet. See HANDOFF.md, "Testnet vs production".
contract MockStockToken is ERC20, Ownable {
    /// @notice Maximum a single faucet call hands out.
    uint256 public constant FAUCET_AMOUNT = 100e18;

    /// @notice Seconds a wallet must wait between faucet calls.
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @notice Last faucet timestamp per wallet.
    mapping(address => uint256) public lastFaucet;

    /// @notice ERC-8056 corporate action multiplier, 18 decimals. Shares per raw token.
    /// @dev The real thing on Robinhood Chain: a dividend is reinvested by raising this
    ///      while raw balances stay fixed. Settable here so a test can make a dividend
    ///      happen, which is the only way to prove the split actually separates one.
    uint256 public uiMultiplier = 1e18;

    /// @notice ERC-8056's event, emitted so an indexer sees the same history it would onchain.
    event UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier);

    /// @notice Someone topped up test balances.
    event FaucetDrip(address indexed to, uint256 amount);

    error FaucetCooldown(uint256 availableAt);

    /// @param name_   Display name, for example "Apple Inc Stock Token".
    /// @param symbol_ Ticker, for example "AAPL".
    /// @param owner_  Admin able to mint arbitrary test balances for seeding.
    constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) Ownable(owner_) {}

    /// @notice Give the caller test tokens. Free, rate limited, worth nothing.
    function faucet() external {
        uint256 availableAt = lastFaucet[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucet[msg.sender] != 0 && block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetDrip(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Seed helper for deploy scripts and tests.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Pay a dividend the way this chain actually pays one.
    /// @dev Raw balances and totalSupply do not move; only the multiplier does.
    function setUiMultiplier(uint256 next) external onlyOwner {
        require(next >= uiMultiplier, "multiplier cannot fall");
        emit UIMultiplierUpdated(uiMultiplier, next);
        uiMultiplier = next;
    }

    /// @notice Accrue a dividend as a percentage, in basis points of the current multiplier.
    function accrueDividendBps(uint256 bps) external onlyOwner {
        uint256 next = uiMultiplier + (uiMultiplier * bps) / 10_000;
        emit UIMultiplierUpdated(uiMultiplier, next);
        uiMultiplier = next;
    }
}
