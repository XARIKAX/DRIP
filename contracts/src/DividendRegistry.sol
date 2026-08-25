// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IDividendRegistry} from "./interfaces/IDividendRegistry.sol";
import {Dividend, DividendStatus} from "./interfaces/DripTypes.sol";

/// @title DividendRegistry
/// @notice The calendar. Every dividend the protocol knows about lives here.
/// @dev This contract holds no money and moves no tokens. It records what was
///      declared, when the shares go ex, when the issuer pays, and whether the
///      issuer actually paid. Everything else in the protocol reads from it.
///
///      Trust assumption, and it is the big one: ORACLE_ROLE is the source of truth
///      for dividend data. On testnet that is an admin key. In production it must be
///      a dividend oracle or a keyed keeper reading issuer corporate action feeds,
///      ideally behind a timelock and a multisig. A dishonest oracle can declare a
///      dividend that never settles, which is exactly the loss path the vault's
///      utilisation cap and clawback exist to bound. See HANDOFF.md.
contract DividendRegistry is IDividendRegistry, AccessControl {
    /// @notice May declare and void dividends. Testnet: admin. Production: oracle or keeper.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice May mark a dividend settled. Held by DripCore, which is where the cash lands.
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    /// @notice Longest window allowed between ex date and pay date. Bounds vault exposure.
    uint64 public constant MAX_SETTLEMENT_WINDOW = 90 days;

    /// @dev dividendId => record. Ids start at 1 so zero reads as "does not exist".
    mapping(uint256 => Dividend) private _dividends;

    /// @dev stockToken => dividend ids, oldest first.
    mapping(address => uint256[]) private _byToken;

    /// @dev Every stock token the registry has seen.
    address[] private _tokens;

    /// @dev Set membership for _tokens.
    mapping(address => bool) private _isKnownToken;

    /// @inheritdoc IDividendRegistry
    uint256 public dividendCount;

    error ZeroAddress();
    error ZeroAmount();
    error ExDateInPast(uint64 exDate, uint256 nowTs);
    error PayDateBeforeExDate(uint64 exDate, uint64 payDate);
    error SettlementWindowTooLong(uint64 window);
    error UnknownDividend(uint256 dividendId);
    error NotDeclared(uint256 dividendId, DividendStatus status);

    /// @param admin Receives DEFAULT_ADMIN_ROLE and, for testnet convenience, ORACLE_ROLE.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    /// @inheritdoc IDividendRegistry
    function declareDividend(address stockToken, uint256 amountPerToken, uint64 exDate, uint64 payDate)
        external
        onlyRole(ORACLE_ROLE)
        returns (uint256 dividendId)
    {
        if (stockToken == address(0)) revert ZeroAddress();
        if (amountPerToken == 0) revert ZeroAmount();
        if (exDate < block.timestamp) revert ExDateInPast(exDate, block.timestamp);
        if (payDate <= exDate) revert PayDateBeforeExDate(exDate, payDate);
        if (payDate - exDate > MAX_SETTLEMENT_WINDOW) revert SettlementWindowTooLong(payDate - exDate);

        dividendId = ++dividendCount;
        _dividends[dividendId] = Dividend({
            stockToken: stockToken,
            amountPerToken: amountPerToken,
            exDate: exDate,
            payDate: payDate,
            declaredAt: uint64(block.timestamp),
            status: DividendStatus.DECLARED
        });
        _byToken[stockToken].push(dividendId);

        if (!_isKnownToken[stockToken]) {
            _isKnownToken[stockToken] = true;
            _tokens.push(stockToken);
            emit SupportedTokenAdded(stockToken, _symbolOf(stockToken));
        }

        emit DividendDeclared(dividendId, stockToken, amountPerToken, exDate, payDate);
    }

    /// @inheritdoc IDividendRegistry
    function settleDividend(uint256 dividendId, uint256 totalPaid) external onlyRole(SETTLER_ROLE) {
        Dividend storage d = _requireDeclared(dividendId);
        d.status = DividendStatus.SETTLED;
        emit DividendSettled(dividendId, d.stockToken, totalPaid);
    }

    /// @inheritdoc IDividendRegistry
    function voidDividend(uint256 dividendId, string calldata reason) external onlyRole(ORACLE_ROLE) {
        Dividend storage d = _requireDeclared(dividendId);
        d.status = DividendStatus.VOIDED;
        emit DividendVoided(dividendId, d.stockToken, reason);
    }

    /// @notice Register a stock token before any dividend exists, so the UI can list it.
    function addSupportedToken(address stockToken) external onlyRole(ORACLE_ROLE) {
        if (stockToken == address(0)) revert ZeroAddress();
        if (_isKnownToken[stockToken]) return;
        _isKnownToken[stockToken] = true;
        _tokens.push(stockToken);
        emit SupportedTokenAdded(stockToken, _symbolOf(stockToken));
    }

    /// @inheritdoc IDividendRegistry
    function getDividend(uint256 dividendId) external view returns (Dividend memory) {
        return _dividends[dividendId];
    }

    /// @inheritdoc IDividendRegistry
    function statusOf(uint256 dividendId) external view returns (DividendStatus) {
        return _dividends[dividendId].status;
    }

    /// @inheritdoc IDividendRegistry
    function dividendsForToken(address stockToken) external view returns (uint256[] memory) {
        return _byToken[stockToken];
    }

    /// @inheritdoc IDividendRegistry
    function supportedTokens() external view returns (address[] memory) {
        return _tokens;
    }

    /// @inheritdoc IDividendRegistry
    function getDividends(uint256 offset, uint256 limit) external view returns (Dividend[] memory page) {
        uint256 total = dividendCount;
        if (offset >= total) return new Dividend[](0);
        uint256 n = total - offset;
        if (n > limit) n = limit;
        page = new Dividend[](n);
        for (uint256 i = 0; i < n; ++i) {
            page[i] = _dividends[offset + i + 1];
        }
    }

    /// @dev Reverts unless the dividend exists and is still in DECLARED.
    function _requireDeclared(uint256 dividendId) private view returns (Dividend storage d) {
        d = _dividends[dividendId];
        if (d.status == DividendStatus.NONE) revert UnknownDividend(dividendId);
        if (d.status != DividendStatus.DECLARED) revert NotDeclared(dividendId, d.status);
    }

    /// @dev Best effort symbol read. A token without symbol() still registers.
    function _symbolOf(address token) private view returns (string memory) {
        try IERC20Metadata(token).symbol() returns (string memory s) {
            return s;
        } catch {
            return "";
        }
    }
}
