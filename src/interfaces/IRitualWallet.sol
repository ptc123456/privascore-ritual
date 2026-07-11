// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice RitualWallet prepaid fee escrow (0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948)
interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;
    function balanceOf(address account) external view returns (uint256);
}
