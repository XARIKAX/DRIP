// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title StackToken
/// @notice One share of a Stack: a fixed basket of tokens, held together.
/// @dev Eighteen decimals regardless of what the basket holds, because a share is a
///      unit of the Stack and not of anything inside it. The vault that deployed this
///      is the only address that may mint or burn, so the supply can never say more
///      than the vault is holding.
contract StackToken is ERC20 {
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
