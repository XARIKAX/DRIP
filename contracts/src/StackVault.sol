// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {StackToken} from "./StackToken.sol";

/// @title StackVault
/// @notice Bundles several tokens into one, and takes it apart again.
/// @dev A Stack is a fixed basket. Each constituent has a UNITS PER SHARE — how much of
///      it one whole Stack share is made of — and minting hands the vault exactly that,
///      times the shares you asked for. Redeeming hands it back. Nothing is swapped,
///      nothing is priced, and nothing is rebalanced.
///
///      UNITS, NOT WEIGHTS, and that is the whole design. A weight is a claim about
///      relative value, so honouring one means pricing every constituent at the moment
///      of the trade — which needs an oracle for each. Osinko has feeds for eleven
///      stocks and none at all for a memecoin somebody pasted the address of, so a
///      weight-based basket could only ever hold the eleven. Units need no price: the
///      basket is a recipe, and the app converts a designer's weights into a recipe
///      once, up front, where a missing price is a visible problem rather than a
///      revert in somebody's mint.
///
///      IN KIND, both ways. This is how a physically-backed ETF creates and redeems,
///      and it is what makes the contract boring: there is no slippage, no price risk,
///      no dependence on liquidity existing, and the backing is not an invariant to be
///      checked but an arithmetic fact. A helper that swaps USDG into the constituents
///      and mints in one transaction belongs in the app, in front of this, where its
///      slippage is the caller's to bound.
///
///      THE BACKING RULE: mint rounds the deposit UP and redeem rounds the payout DOWN,
///      so every rounding error lands in the vault's favour. The alternative leaves the
///      last redeemer of a Stack short by dust that the first minter kept, which is a
///      small unfairness with an unbounded number of chances to happen.
contract StackVault is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice May create Stacks. Open to the admin; grantable to a factory or to users.
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    uint256 private constant ONE = 1e18;

    /// @dev Six, matching the builder. Past that the ring's badges collide and the
    ///      idea stops being legible, and a basket nobody can read is not a product.
    uint256 public constant MAX_CONSTITUENTS = 6;

    struct Stack {
        address token;
        address creator;
        address[] constituents;
        /// @dev Raw token amount of each constituent per 1e18 shares.
        uint256[] unitsPerShare;
        bool exists;
        bool frozen;
    }

    uint256 public stackCount;
    mapping(uint256 => Stack) private _stacks;

    /// @dev stackId => token => amount this Stack is holding. Per Stack rather than a
    ///      bare balance, so a token that appears in two Stacks can never have one
    ///      Stack's redemption paid out of the other's backing.
    mapping(uint256 => mapping(address => uint256)) public heldOf;

    event StackCreated(
        uint256 indexed stackId,
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        address[] constituents,
        uint256[] unitsPerShare
    );
    event Minted(uint256 indexed stackId, address indexed to, uint256 shares);
    event Redeemed(uint256 indexed stackId, address indexed from, uint256 shares);
    event StackFrozen(uint256 indexed stackId);

    error ZeroAddress();
    error ZeroAmount();
    error StackNotFound(uint256 stackId);
    error StackIsFrozen(uint256 stackId);
    error NoConstituents();
    error TooManyConstituents(uint256 given, uint256 max);
    error LengthMismatch(uint256 constituents, uint256 units);
    error DuplicateConstituent(address token);
    error ZeroUnits(address token);
    error NotAToken(address token);
    error InsufficientBacking(address token, uint256 needed, uint256 held);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CREATOR_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Creating a Stack
    // ---------------------------------------------------------------------

    /// @notice Define a basket and deploy its share token.
    /// @param constituents  What it holds. Order is kept and is what every array here means.
    /// @param unitsPerShare Raw amount of each constituent per 1e18 shares, same order.
    /// @dev Every constituent is read for `decimals()` before it is accepted. A basket
    ///      whose recipe names something that is not a token would mint fine and then
    ///      revert on the first redemption, stranding everything deposited beside it.
    function createStack(
        string calldata name_,
        string calldata symbol_,
        address[] calldata constituents,
        uint256[] calldata unitsPerShare
    ) external onlyRole(CREATOR_ROLE) whenNotPaused returns (uint256 stackId) {
        _validateRecipe(constituents, unitsPerShare);

        stackId = ++stackCount;
        address token = address(new StackToken(name_, symbol_));

        Stack storage s = _stacks[stackId];
        s.token = token;
        s.creator = msg.sender;
        s.constituents = constituents;
        s.unitsPerShare = unitsPerShare;
        s.exists = true;

        emit StackCreated(stackId, token, msg.sender, name_, symbol_, constituents, unitsPerShare);
    }

    /// @dev Split out so `createStack` keeps a shallow stack, and because every reason
    ///      a recipe can be wrong belongs in one place rather than scattered through
    ///      the thing that writes storage.
    function _validateRecipe(address[] calldata constituents, uint256[] calldata unitsPerShare) private view {
        uint256 n = constituents.length;
        if (n == 0) revert NoConstituents();
        if (n > MAX_CONSTITUENTS) revert TooManyConstituents(n, MAX_CONSTITUENTS);
        if (n != unitsPerShare.length) revert LengthMismatch(n, unitsPerShare.length);

        for (uint256 i = 0; i < n; ++i) {
            address t = constituents[i];
            if (t == address(0)) revert ZeroAddress();
            if (unitsPerShare[i] == 0) revert ZeroUnits(t);
            // A duplicate would be held once and redeemed twice.
            for (uint256 j = 0; j < i; ++j) {
                if (constituents[j] == t) revert DuplicateConstituent(t);
            }
            // A recipe naming something that is not a token would mint fine and then
            // revert on the first redemption, stranding everything deposited beside it.
            //
            // The code check comes first and is not decoration: Solidity emits an
            // extcodesize guard before a high-level call that expects a return value,
            // and that guard reverts in THIS frame — so try/catch never sees it and the
            // caller gets a bare revert with no reason. Checking here is what turns
            // "something failed" into "that is not a token".
            if (t.code.length == 0) revert NotAToken(t);
            try IERC20Metadata(t).decimals() returns (uint8) {}
            catch {
                revert NotAToken(t);
            }
        }
    }

    /// @notice Stop new minting for a Stack. Redemption is never stopped.
    /// @dev Deliberately one way and deliberately partial. An admin who could also
    ///      block redemption could strand somebody's basket; an admin who can only
    ///      close the door keeps the exit open, which is the only version of this
    ///      switch worth having.
    function freezeStack(uint256 stackId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _get(stackId).frozen = true;
        emit StackFrozen(stackId);
    }

    // ---------------------------------------------------------------------
    // Minting and redeeming
    // ---------------------------------------------------------------------

    /// @notice Deposit the basket, receive shares. Caller must have approved every constituent.
    /// @dev Deposits round UP, so the vault is never left holding less than the supply
    ///      says it should.
    function mint(uint256 stackId, uint256 shares) external nonReentrant whenNotPaused {
        Stack storage s = _get(stackId);
        if (s.frozen) revert StackIsFrozen(stackId);
        if (shares == 0) revert ZeroAmount();

        uint256 n = s.constituents.length;
        for (uint256 i = 0; i < n; ++i) {
            address t = s.constituents[i];
            uint256 amount = _ceilDiv(s.unitsPerShare[i] * shares, ONE);
            if (amount == 0) revert ZeroAmount();
            heldOf[stackId][t] += amount;
            IERC20(t).safeTransferFrom(msg.sender, address(this), amount);
        }

        StackToken(s.token).mint(msg.sender, shares);
        emit Minted(stackId, msg.sender, shares);
    }

    /// @notice Burn shares, take the basket back.
    /// @dev Payouts round DOWN, and only ever come out of this Stack's own ledger.
    function redeem(uint256 stackId, uint256 shares) external nonReentrant {
        Stack storage s = _get(stackId);
        if (shares == 0) revert ZeroAmount();

        // Burn first: the shares stop existing before anything leaves, so a constituent
        // that re-enters on transfer finds a supply that has already been reduced.
        StackToken(s.token).burn(msg.sender, shares);

        uint256 n = s.constituents.length;
        for (uint256 i = 0; i < n; ++i) {
            address t = s.constituents[i];
            uint256 amount = (s.unitsPerShare[i] * shares) / ONE;
            if (amount == 0) continue;

            uint256 held = heldOf[stackId][t];
            if (amount > held) revert InsufficientBacking(t, amount, held);
            heldOf[stackId][t] = held - amount;
            IERC20(t).safeTransfer(msg.sender, amount);
        }

        emit Redeemed(stackId, msg.sender, shares);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function stackOf(uint256 stackId)
        external
        view
        returns (
            address token,
            address creator,
            address[] memory constituents,
            uint256[] memory unitsPerShare,
            bool frozen
        )
    {
        Stack storage s = _get(stackId);
        return (s.token, s.creator, s.constituents, s.unitsPerShare, s.frozen);
    }

    /// @notice What minting `shares` would cost, constituent by constituent.
    /// @dev The same ceiling the mint applies, so a caller can approve exactly this and
    ///      not have the transfer come up a wei short.
    function previewMint(uint256 stackId, uint256 shares)
        external
        view
        returns (address[] memory constituents, uint256[] memory amounts)
    {
        Stack storage s = _get(stackId);
        constituents = s.constituents;
        amounts = new uint256[](constituents.length);
        for (uint256 i = 0; i < constituents.length; ++i) {
            amounts[i] = _ceilDiv(s.unitsPerShare[i] * shares, ONE);
        }
    }

    /// @notice What redeeming `shares` would return.
    function previewRedeem(uint256 stackId, uint256 shares)
        external
        view
        returns (address[] memory constituents, uint256[] memory amounts)
    {
        Stack storage s = _get(stackId);
        constituents = s.constituents;
        amounts = new uint256[](constituents.length);
        for (uint256 i = 0; i < constituents.length; ++i) {
            amounts[i] = (s.unitsPerShare[i] * shares) / ONE;
        }
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _get(uint256 stackId) private view returns (Stack storage s) {
        s = _stacks[stackId];
        if (!s.exists) revert StackNotFound(stackId);
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : ((a - 1) / b) + 1;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
