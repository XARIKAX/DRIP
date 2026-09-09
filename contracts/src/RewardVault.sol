// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RewardVault
/// @notice Osinko's reward token: one YT, one USDG, redeemable whenever the holder
///         likes, without unwinding the stock that earned it.
/// @dev A discretionary distribution, not a promised rate. The operator funds the
///      vault with USDG and hands out YT against it; holders redeem YT for that USDG
///      one for one. What is distributed is bounded by what was funded, which is the
///      whole point — the liability cannot exceed the pot.
///
///      ONE INVARIANT, and everything else follows from it:
///
///          totalSupply() <= usdg.balanceOf(address(this))
///
///      Every YT in existence is a dollar sitting in this contract. distribute()
///      cannot mint past the balance and redeem() burns before it pays, so the vault
///      can never owe more than it holds. Funding is a plain transfer in, so nobody
///      can withdraw the backing out from under the tokens.
///
///      WHAT THIS IS NOT: it is not the SplitVault's yield token. Those are per
///      series, named y1 through y11, and represent a claim on a stock's dividends
///      before maturity. This is a single token representing one USDG. The two never
///      interact — deliberately. Pegging a split series' YT to a dollar would break
///      the invariant that PT plus YT reconstitutes the share, and let a holder redeem
///      the YT for cash and still take the whole share at maturity.
///
///      Who gets how much is decided off the chain: the keeper reads every depositor's
///      position, prices it, and works out each share of the pot pro rata. That is
///      what makes the distribution discretionary rather than a rate the protocol has
///      promised and might not be able to pay.
contract RewardVault is ERC20, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice May hand out YT against the funded balance.
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");

    IERC20 public immutable usdg;

    /// @notice USDG paid in, cumulative. Never decreases; a funding history, not a balance.
    uint256 public totalFunded;
    /// @notice YT redeemed for USDG, cumulative. What holders have actually taken.
    uint256 public totalRedeemed;

    event Funded(address indexed from, uint256 amount, uint256 totalFunded);
    event Distributed(address indexed to, uint256 amount);
    event Redeemed(address indexed holder, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error LengthMismatch(uint256 users, uint256 amounts);
    error ExceedsBacking(uint256 wouldOwe, uint256 held);

    constructor(IERC20 usdg_, address admin) ERC20("Osinko Yield Token", "YT") {
        if (address(usdg_) == address(0) || admin == address(0)) revert ZeroAddress();
        usdg = usdg_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DISTRIBUTOR_ROLE, admin);
    }

    /// @dev Six, to match USDG. One YT is one USDG and the two should read alike in a
    ///      wallet; eighteen here would make a $1 reward display as 0.000000000001.
    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(usdg)).decimals();
    }

    /// @notice Pay USDG in. Anyone may fund; only a distributor may hand it out.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        totalFunded += amount;
        emit Funded(msg.sender, amount, totalFunded);
    }

    /// @notice Hand out YT to holders, in one batch.
    /// @dev The amounts are computed off the chain, pro rata on the dollar value of
    ///      each deposit, because doing it here would mean walking every depositor and
    ///      pricing every position inside one transaction. What is enforced here is the
    ///      part that must not be got wrong: the total in circulation after this call
    ///      still cannot exceed the USDG held.
    function distribute(address[] calldata users, uint256[] calldata amounts)
        external
        onlyRole(DISTRIBUTOR_ROLE)
        nonReentrant
    {
        if (users.length != amounts.length) revert LengthMismatch(users.length, amounts.length);

        uint256 adding;
        for (uint256 i = 0; i < amounts.length; ++i) {
            adding += amounts[i];
        }

        uint256 held = usdg.balanceOf(address(this));
        uint256 wouldOwe = totalSupply() + adding;
        if (wouldOwe > held) revert ExceedsBacking(wouldOwe, held);

        for (uint256 i = 0; i < users.length; ++i) {
            if (users[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) continue;
            _mint(users[i], amounts[i]);
            emit Distributed(users[i], amounts[i]);
        }
    }

    /// @notice Burn YT, take the USDG behind it. One for one, no waiting, no fee.
    function redeem(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _burn(msg.sender, amount);
        totalRedeemed += amount;
        usdg.safeTransfer(msg.sender, amount);
        emit Redeemed(msg.sender, amount);
    }

    /// @notice USDG in the vault that no YT has a claim on yet.
    /// @dev What a distributor still has to give away. Zero means the pot is fully
    ///      allocated and the next distribution needs funding first.
    function unallocated() external view returns (uint256) {
        uint256 held = usdg.balanceOf(address(this));
        uint256 owed = totalSupply();
        return held > owed ? held - owed : 0;
    }
}
