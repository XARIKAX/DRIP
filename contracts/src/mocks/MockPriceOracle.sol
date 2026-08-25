// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @title MockPriceOracle
/// @notice TESTNET ONLY. Admin set stock prices in USDG.
/// @dev Production replaces this with a real feed. Reverts on an unset price rather
///      than returning zero, which is the behaviour a production feed must also have.
contract MockPriceOracle is IPriceOracle, Ownable {
    mapping(address => uint256) private _prices;

    event PriceSet(address indexed stockToken, uint256 priceUsdg);

    error NoPrice(address stockToken);

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Set the USDG price of one whole stock token.
    function setPrice(address stockToken, uint256 price) external onlyOwner {
        _prices[stockToken] = price;
        emit PriceSet(stockToken, price);
    }

    /// @inheritdoc IPriceOracle
    function priceUsdg(address stockToken) external view returns (uint256) {
        uint256 p = _prices[stockToken];
        if (p == 0) revert NoPrice(stockToken);
        return p;
    }
}
