// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PrivaToken — utility/reward token for PrivaScore
/// @notice Minted as a small reward when a score settles. Used optionally as refresh fee.
contract PrivaToken is ERC20, Ownable {
    address public minter;

    error OnlyMinter();
    error ZeroAddress();

    event MinterUpdated(address indexed previous, address indexed current);

    constructor(address initialOwner) ERC20("Priva Token", "PRIVA") Ownable(initialOwner) {}

    function setMinter(address _minter) external onlyOwner {
        if (_minter == address(0)) revert ZeroAddress();
        emit MinterUpdated(minter, _minter);
        minter = _minter;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert OnlyMinter();
        _mint(to, amount);
    }
}
