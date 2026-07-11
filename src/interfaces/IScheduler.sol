// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Ritual Scheduler system contract (0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B)
/// @dev Official ABI from ritual-dapp-skills / ritual-dapp-scheduler
interface IScheduler {
    /// @notice Full schedule with fee parameters
    function schedule(
        bytes calldata data,
        uint32 gas,
        uint32 startBlock,
        uint32 numCalls,
        uint32 frequency,
        uint32 ttl,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        uint256 value,
        address payer
    ) external returns (uint256 callId);

    /// @notice Minimal schedule overload
    function schedule(
        bytes calldata data,
        uint32 gas,
        uint32 numCalls,
        uint32 frequency
    ) external returns (uint256 callId);

    function cancel(uint256 callId) external;

    function approveScheduler(address schedulerContract) external;

    function getCallState(uint256 callId) external view returns (uint8 state);
}
