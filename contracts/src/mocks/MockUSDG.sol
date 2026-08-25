// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDG
/// @notice TESTNET ONLY. Stands in for USDG, the settlement stablecoin.
/// @dev Six decimals, same as the real thing. Production swaps in the canonical
///      USDG address and deletes this file. Nothing else changes.
contract MockUSDG is ERC20, Ownable {
    /// @notice Maximum a single faucet call hands out. 10,000 USDG.
    uint256 public constant FAUCET_AMOUNT = 10_000e6;

    /// @notice Seconds a wallet must wait between faucet calls.
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    /// @notice Last faucet timestamp per wallet.
    mapping(address => uint256) public lastFaucet;

    event FaucetDrip(address indexed to, uint256 amount);

    error FaucetCooldown(uint256 availableAt);

    constructor(address owner_) ERC20("Mock USDG", "USDG") Ownable(owner_) {}

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Give the caller test USDG. Free, rate limited, worth nothing.
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
}
