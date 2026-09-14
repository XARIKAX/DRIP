// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice A yield venue that can earn, and can also refuse to pay.
/// @dev The refusal is the point. A vault that always pays back on demand cannot
///      test what happens when the pool's money is somewhere that will not hand it
///      over, and that case — not the happy one — is what decides whether parking
///      cash is safe.
contract MockERC4626 is ERC4626 {
    /// @notice Cap on redemptions, to stand in for a venue with a queue or a lock.
    uint256 public withdrawalCap = type(uint256).max;

    constructor(IERC20 asset_) ERC20("Mock Yield", "mYLD") ERC4626(asset_) {}

    /// @notice Hand the venue free assets, so shares are worth more than they cost.
    function accrue(uint256 amount) external {
        IERC20(asset()).transferFrom(msg.sender, address(this), amount);
    }

    function setWithdrawalCap(uint256 cap) external {
        withdrawalCap = cap;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 natural = super.maxWithdraw(owner);
        return natural > withdrawalCap ? withdrawalCap : natural;
    }
}
