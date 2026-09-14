// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IIdleYield} from "../interfaces/IIdleYield.sol";

/// @title ERC4626IdleYield
/// @notice Parks resting USDG in any ERC-4626 vault on the holder's behalf.
/// @dev One depositor, named at construction, and nobody else — the pool whose cash
///      this is. Shares are held here rather than by the pool so the pool's own
///      accounting never has to learn a second token, and `totalAssets` converts them
///      back to USDG so the pool reads one number in the unit it thinks in.
///
///      `maxWithdraw` passes through the target vault's own limit rather than assuming
///      the position is liquid. A 4626 vault is entitled to cap redemptions, and a pool
///      that believed otherwise would promise a holder money it could not fetch.
contract ERC4626IdleYield is IIdleYield, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IERC4626 public immutable vault;

    /// @notice The only address that may deposit or withdraw. The pool this serves.
    address public immutable depositor;

    error NotDepositor(address caller);
    error ZeroAddress();
    error AssetMismatch(address vaultAsset, address expected);
    error ShortWithdrawal(uint256 got, uint256 wanted);

    modifier onlyDepositor() {
        if (msg.sender != depositor) revert NotDepositor(msg.sender);
        _;
    }

    constructor(IERC4626 vault_, address depositor_, address owner_) Ownable(owner_) {
        if (address(vault_) == address(0) || depositor_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        vault = vault_;
        depositor = depositor_;
        asset = IERC20(vault_.asset());
    }

    /// @inheritdoc IIdleYield
    function deposit(uint256 amount) external onlyDepositor returns (uint256) {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        asset.forceApprove(address(vault), amount);
        vault.deposit(amount, address(this));
        asset.forceApprove(address(vault), 0);
        return amount;
    }

    /// @inheritdoc IIdleYield
    /// @dev Exactly `amount` or revert. A partial fill would leave the pool believing
    ///      it had fetched enough and reverting later, somewhere less legible.
    function withdraw(uint256 amount) external onlyDepositor returns (uint256) {
        uint256 before = asset.balanceOf(address(this));
        vault.withdraw(amount, address(this), address(this));
        uint256 got = asset.balanceOf(address(this)) - before;
        if (got < amount) revert ShortWithdrawal(got, amount);
        asset.safeTransfer(msg.sender, amount);
        // Anything over — a vault that rounded in our favour — stays and is counted
        // by totalAssets on the next read, so it is the depositor's either way.
        return amount;
    }

    /// @inheritdoc IIdleYield
    function totalAssets() external view returns (uint256) {
        return vault.convertToAssets(vault.balanceOf(address(this))) + asset.balanceOf(address(this));
    }

    /// @inheritdoc IIdleYield
    function maxWithdraw() external view returns (uint256) {
        return vault.maxWithdraw(address(this)) + asset.balanceOf(address(this));
    }

    /// @notice Recover a token that is not the asset or the vault's shares.
    /// @dev Airdrops and mistaken transfers only. It cannot touch the position: the
    ///      shares and the USDG are what the pool is owed.
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(asset) || token == address(vault)) revert AssetMismatch(token, address(0));
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
