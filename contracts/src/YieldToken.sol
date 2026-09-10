// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IScaledUI} from "./interfaces/IScaledUI.sol";

/// @title YieldToken
/// @notice The dividend, tokenized. One YT is the right to everything one raw stock
///         token accretes between the moment it was split and the series' maturity.
/// @dev THE ACCRUAL, stated once:
///
///        accruedShares(user) += ytBalance(user) * (M_now - userIndex(user)) / 1e18
///
///      YT is denominated in RAW stock tokens, not shares, and that is what makes the
///      accrual linear in the multiplier and so bankable with a per user index — the
///      ordinary staking-rewards accumulator, with the multiplier as the index. Two
///      holders who split at different multipliers each earn exactly the growth that
///      happened while they held, and no more; a flat pro rata of the pot would pay
///      the later entrant for growth that predated them.
///
///      Every balance change settles both sides first, at their pre-change balances,
///      so a transfer moves the future and never the past: yield already earned stays
///      banked to whoever earned it, and the buyer starts accruing from the index they
///      bought at.
///
///      After maturity YT stops earning. `frozenIndex` is the multiplier as of the
///      first touch at or after maturity, and every later settle uses it. Anyone can
///      call `freeze()`, and the vault does so on every path that matters, because an
///      unfrozen expired series would keep paying YT out of PT's principal.
contract YieldToken is ERC20 {
    error NotVault();

    address public immutable vault;
    IScaledUI public immutable stock;
    uint64 public immutable maturity;

    /// @notice Multiplier at which each holder's banked accrual was last brought up to date.
    mapping(address => uint256) public userIndex;
    /// @notice Yield already earned and set aside, in SHARE units, 18 decimals.
    mapping(address => uint256) public accruedShares;

    /// @notice Multiplier as of maturity, zero until someone freezes it.
    uint256 public frozenIndex;

    event Frozen(uint256 index);
    event Accrued(address indexed user, uint256 shares, uint256 index);

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(string memory name_, string memory symbol_, IScaledUI stock_, uint64 maturity_)
        ERC20(name_, symbol_)
    {
        vault = msg.sender;
        stock = stock_;
        maturity = maturity_;
    }

    /// @notice The index accrual is measured against right now.
    /// @dev Live before maturity, frozen after. Reading it never freezes; only
    ///      `freeze()` writes, so this stays a view for the UI to poll freely.
    function currentIndex() public view returns (uint256) {
        if (frozenIndex != 0) return frozenIndex;
        uint256 m = stock.uiMultiplier();
        return m;
    }

    /// @notice Stop the clock at maturity. Permissionless, idempotent, and a no-op
    ///         before maturity — the first person through the door after a series
    ///         expires does it for everybody.
    function freeze() public {
        if (frozenIndex == 0 && block.timestamp >= maturity) {
            frozenIndex = stock.uiMultiplier();
            emit Frozen(frozenIndex);
        }
    }

    /// @notice What `user` would have banked if they settled this instant.
    function previewAccrued(address user) public view returns (uint256) {
        uint256 index = currentIndex();
        uint256 last = userIndex[user];
        uint256 bal = balanceOf(user);
        if (bal == 0 || last == 0 || index <= last) return accruedShares[user];
        return accruedShares[user] + (bal * (index - last)) / 1e18;
    }

    /// @notice Bring a holder's banked yield up to date. Permissionless and safe to
    ///         call at any time; the vault calls it before paying anyone out.
    function settle(address user) public {
        if (user == address(0)) return;
        freeze();
        uint256 index = currentIndex();
        uint256 last = userIndex[user];
        uint256 bal = balanceOf(user);

        // A holder seen for the first time starts accruing here, not from zero: an
        // index of zero would credit them the token's entire history since launch.
        if (last != 0 && bal != 0 && index > last) {
            uint256 gained = (bal * (index - last)) / 1e18;
            accruedShares[user] += gained;
            emit Accrued(user, gained, index);
        }
        userIndex[user] = index;
    }

    /// @notice Hand the vault a holder's banked yield and zero it.
    function drawAccrued(address user) external onlyVault returns (uint256 shares) {
        settle(user);
        shares = accruedShares[user];
        accruedShares[user] = 0;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }

    /// @dev Settle both sides at their PRE-change balances, then move the tokens. Any
    ///      other order pays the wrong person: settling after would credit the
    ///      receiver for growth that happened before they owned anything.
    function _update(address from, address to, uint256 value) internal override {
        settle(from);
        settle(to);
        super._update(from, to, value);
        // A receiver who held nothing has no index yet, and `settle` above left it at
        // zero because their balance was zero. Set it now, or their first settle would
        // see last == 0 and silently drop the yield they are owed from this moment on.
        if (to != address(0) && userIndex[to] == 0) userIndex[to] = currentIndex();
    }
}
