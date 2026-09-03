// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title YieldToken
/// @notice The drip, tokenized. One YT is the right to whatever dividend a split
///         share earns between the split and the series' maturity.
/// @dev Every mint, burn and transfer writes a checkpoint, the exact mechanism
///      DripCore already uses for its own ex-date eligibility: balances are
///      provable at any past timestamp from this contract's own history, so a
///      dividend harvested after a transfer still pays the holder who actually
///      held the YT at the ex date, not whoever holds it now. Minted and burned
///      only by the SplitVault that deployed it.
contract YieldToken is ERC20 {
    using Checkpoints for Checkpoints.Trace208;

    error NotVault();

    address public immutable vault;

    mapping(address => Checkpoints.Trace208) private _balanceHistory;
    Checkpoints.Trace208 private _supplyHistory;

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

    /// @notice Balance a holder had at or before a past timestamp. The claim proof.
    function balanceOfAt(address account, uint64 timestamp) external view returns (uint256) {
        return _balanceHistory[account].upperLookupRecent(SafeCast.toUint48(timestamp));
    }

    /// @notice Total supply at or before a past timestamp. The pro-rata denominator.
    function totalSupplyAt(uint64 timestamp) external view returns (uint256) {
        return _supplyHistory.upperLookupRecent(SafeCast.toUint48(timestamp));
    }

    /// @dev OZ 5.x's single transfer hook. Covers mint (from == 0), burn (to == 0)
    ///      and ordinary transfers in one place, same as every ERC20Votes checkpoint.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        uint48 key = SafeCast.toUint48(block.timestamp);
        if (from != address(0)) {
            _balanceHistory[from].push(key, SafeCast.toUint208(balanceOf(from)));
        }
        if (to != address(0)) {
            _balanceHistory[to].push(key, SafeCast.toUint208(balanceOf(to)));
        }
        if (from == address(0) || to == address(0)) {
            _supplyHistory.push(key, SafeCast.toUint208(totalSupply()));
        }
    }
}
