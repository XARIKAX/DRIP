// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title PrincipalToken
/// @notice The share, minus the drip. One PT is redeemable for one whole stock
///         token at or after the series' maturity — the price a market can put on
///         the stock alone, separated from whatever it pays out along the way.
/// @dev No checkpointing here: redemption only ever looks at the current balance,
///      never a past one. Minted and burned only by the SplitVault that deployed it.
contract PrincipalToken is ERC20 {
    error NotVault();

    address public immutable vault;

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        vault = msg.sender;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }
}
