// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";

/// @title DividendRouter
/// @notice Say once where your dividends should go, and every future one goes there.
/// @dev A stock token reinvests its dividend into itself, by force. Osinko already
///      separates that growth out; this decides what it turns into. One saved setting
///      per holder — a token to end up in and a wallet to end up at — applied to
///      anything they route afterwards.
///
///      THE CUSTODY RULE, stated once: this contract never holds anything between
///      calls. Every route pulls, converts and delivers inside one transaction, and
///      asserts it kept nothing. There is no balance here to drain, no admin function
///      that can move a holder's tokens, and no standing claim on anyone's wallet
///      beyond the allowance they grant for a single route. A router that accumulated
///      would be a honeypot wearing a convenience feature.
///
///      Sending somewhere other than your own wallet is the same path with a different
///      recipient, which is why "pay my dividends to my sister" costs no extra code.
///      Sending to the token you already hold is a transfer, not a swap: it skips the
///      adapter entirely rather than paying a spread to end up where it started.
contract DividendRouter is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    /// @dev Ceiling on the saved slippage tolerance. Ten percent is already generous
    ///      for anything this would route; higher is a holder agreeing to be robbed.
    uint16 public constant MAX_SLIPPAGE_BPS = 1_000;

    /// @param tokenOut       What dividends are turned into. Zero means no route set.
    /// @param recipient      Where they land. Zero means the holder's own wallet.
    /// @param maxSlippageBps Worst execution this holder will accept, against the
    ///                       adapter's own quote at the time of the route.
    struct Route {
        address tokenOut;
        address recipient;
        uint16 maxSlippageBps;
    }

    ISwapAdapter public adapter;

    /// @notice The pair token every swap on this chain goes through.
    /// @dev The adapter only knows USDG-to-stock and stock-to-USDG — the production one
    ///      calls exactInputSingle, one pool, nothing else. So an Apple dividend landing
    ///      in Bitcoin is two hops, and doing that hop is what makes this a router
    ///      rather than a preference store.
    address public immutable usdg;

    mapping(address => Route) private _routes;

    event RouteSet(address indexed user, address tokenOut, address recipient, uint16 maxSlippageBps);
    event RouteCleared(address indexed user);
    event Routed(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );
    event AdapterSet(address adapter);

    error NoRoute(address user);
    error ZeroAddress();
    error ZeroAmount();
    error SlippageTooHigh(uint16 bps, uint16 max);
    error BelowFloor(uint256 got, uint256 floor);
    error RouterRetainedFunds(address token, uint256 amount);

    constructor(ISwapAdapter adapter_, address usdg_, address owner_) Ownable(owner_) {
        if (address(adapter_) == address(0) || usdg_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        adapter = adapter_;
        usdg = usdg_;
    }

    // ---------------------------------------------------------------------
    // The setting
    // ---------------------------------------------------------------------

    /// @notice Choose what your dividends become and where they land.
    /// @param tokenOut       Any token the swap adapter can reach. The same token you
    ///                       are routing means "do not convert", and costs no spread.
    /// @param recipient      Zero for your own wallet, or anyone else's address.
    /// @param maxSlippageBps Worst execution you accept. Zero is legal and means the
    ///                       floor comes only from what you pass to `route`.
    function setRoute(address tokenOut, address recipient, uint16 maxSlippageBps) external {
        if (tokenOut == address(0)) revert ZeroAddress();
        if (maxSlippageBps > MAX_SLIPPAGE_BPS) revert SlippageTooHigh(maxSlippageBps, MAX_SLIPPAGE_BPS);
        _routes[msg.sender] = Route(tokenOut, recipient, maxSlippageBps);
        emit RouteSet(msg.sender, tokenOut, recipient, maxSlippageBps);
    }

    /// @notice Stop routing. Dividends stay in whatever they arrive as.
    function clearRoute() external {
        delete _routes[msg.sender];
        emit RouteCleared(msg.sender);
    }

    /// @notice A holder's route. `recipient` is resolved, so it is never zero.
    function routeOf(address user) public view returns (address tokenOut, address recipient, uint16 maxSlippageBps) {
        Route memory r = _routes[user];
        return (r.tokenOut, r.recipient == address(0) ? user : r.recipient, r.maxSlippageBps);
    }

    function hasRoute(address user) external view returns (bool) {
        return _routes[user].tokenOut != address(0);
    }

    // ---------------------------------------------------------------------
    // The route
    // ---------------------------------------------------------------------

    /// @notice Convert `amount` of `tokenIn` into this caller's chosen token and send it on.
    /// @dev `minOut` is the caller's own floor, taken fresh from wherever they quoted.
    ///      The saved slippage tolerance produces a second floor from the adapter's
    ///      quote, and the STRICTER of the two applies — so a caller who passes zero is
    ///      still protected by their setting, and a caller with no setting is still
    ///      protected by what they passed. Quoting and swapping through the same
    ///      adapter is weak protection on its own; that is exactly why the caller's
    ///      number is allowed to win.
    function route(address tokenIn, uint256 amount, uint256 minOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut)
    {
        if (amount == 0) revert ZeroAmount();
        Route memory r = _routes[msg.sender];
        if (r.tokenOut == address(0)) revert NoRoute(msg.sender);
        address recipient = r.recipient == address(0) ? msg.sender : r.recipient;

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

        if (tokenIn == r.tokenOut) {
            // Already the right token. Forwarding it is the whole job; routing it
            // through a pool would cost a spread to arrive where it started.
            IERC20(tokenIn).safeTransfer(recipient, amount);
            amountOut = amount;
        } else {
            uint256 floor = minOut;
            if (r.maxSlippageBps > 0) {
                uint256 quoted = _quote(tokenIn, r.tokenOut, amount);
                uint256 policyFloor = (quoted * (BPS - r.maxSlippageBps)) / BPS;
                if (policyFloor > floor) floor = policyFloor;
            }
            amountOut = _convert(tokenIn, r.tokenOut, amount, floor, recipient);
            if (amountOut < floor) revert BelowFloor(amountOut, floor);
        }

        // Nothing stays here, ever. An adapter that under-spent its input, or a token
        // with a transfer fee, would otherwise leave dust that accumulates into a
        // balance this contract has no way to return to whoever it belonged to. USDG
        // is checked too: a two hop route parks it here between the legs, and a leg
        // that under-delivered would leave it behind.
        _assertEmpty(tokenIn);
        if (tokenIn != usdg) _assertEmpty(usdg);

        emit Routed(msg.sender, tokenIn, r.tokenOut, amount, amountOut, recipient);
    }

    /// @notice What a route would produce right now, and the floor it would enforce.
    function previewRoute(address user, address tokenIn, uint256 amount)
        external
        view
        returns (address tokenOut, address recipient, uint256 expectedOut, uint256 floor)
    {
        Route memory r = _routes[user];
        if (r.tokenOut == address(0)) revert NoRoute(user);
        recipient = r.recipient == address(0) ? user : r.recipient;
        tokenOut = r.tokenOut;

        if (tokenIn == r.tokenOut) return (tokenOut, recipient, amount, amount);

        expectedOut = _quote(tokenIn, r.tokenOut, amount);
        floor = r.maxSlippageBps > 0 ? (expectedOut * (BPS - r.maxSlippageBps)) / BPS : 0;
    }

    // ---------------------------------------------------------------------
    // Routing
    // ---------------------------------------------------------------------

    /// @dev One hop where the adapter has a pair, two through USDG where it does not.
    ///      The floor is applied to the FINAL token only. Bounding the middle leg is
    ///      the classic way to make a sound route revert: the mid amount is not what
    ///      the holder is owed, and constraining it prices a leg nobody is keeping.
    function _convert(address tokenIn, address tokenOut, uint256 amount, uint256 floor, address recipient)
        private
        returns (uint256)
    {
        if (tokenIn == usdg || tokenOut == usdg) {
            return _swap(tokenIn, tokenOut, amount, floor, recipient);
        }
        uint256 mid = _swap(tokenIn, usdg, amount, 0, address(this));
        return _swap(usdg, tokenOut, mid, floor, recipient);
    }

    /// @dev Composed the same way `_convert` executes, so the floor derived from it
    ///      describes the route that actually runs rather than one that does not exist.
    function _quote(address tokenIn, address tokenOut, uint256 amount) private view returns (uint256) {
        if (tokenIn == usdg || tokenOut == usdg) return adapter.quote(tokenIn, tokenOut, amount);
        return adapter.quote(usdg, tokenOut, adapter.quote(tokenIn, usdg, amount));
    }

    function _swap(address tokenIn, address tokenOut, uint256 amount, uint256 floor, address recipient)
        private
        returns (uint256 out)
    {
        IERC20(tokenIn).forceApprove(address(adapter), amount);
        out = adapter.swap(tokenIn, tokenOut, amount, floor, recipient);
        IERC20(tokenIn).forceApprove(address(adapter), 0);
    }

    function _assertEmpty(address token) private view {
        uint256 left = IERC20(token).balanceOf(address(this));
        if (left != 0) revert RouterRetainedFunds(token, left);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice Point at a different swap adapter.
    /// @dev The only privileged function here, and it cannot touch a holder's tokens:
    ///      the router holds none, and a route only ever moves what its own caller
    ///      approved in the same transaction.
    function setAdapter(ISwapAdapter next) external onlyOwner {
        if (address(next) == address(0)) revert ZeroAddress();
        adapter = next;
        emit AdapterSet(address(next));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
