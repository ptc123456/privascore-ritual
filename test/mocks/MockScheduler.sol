// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Tracks schedule() calls for unit tests; optionally auto-executes callback.
contract MockScheduler {
    struct Call {
        address caller;
        bytes data;
        uint32 gasLimit;
        uint32 startBlock;
        uint32 numCalls;
        uint32 frequency;
        uint32 ttl;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        uint256 value;
        address payer;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Call) public calls;
    uint256 public scheduleCount;
    uint256 public lastCallId;
    address public lastCaller;
    bytes public lastData;

    bool public autoExecute;

    function setAutoExecute(bool v) external {
        autoExecute = v;
    }

    function schedule(
        bytes calldata data,
        uint32 gasLimit,
        uint32 startBlock,
        uint32 numCalls,
        uint32 frequency,
        uint32 ttl,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas,
        uint256 value,
        address payer
    ) external returns (uint256 callId) {
        callId = nextId++;
        calls[callId] = Call({
            caller: msg.sender,
            data: data,
            gasLimit: gasLimit,
            startBlock: startBlock,
            numCalls: numCalls,
            frequency: frequency,
            ttl: ttl,
            maxFeePerGas: maxFeePerGas,
            maxPriorityFeePerGas: maxPriorityFeePerGas,
            value: value,
            payer: payer
        });
        scheduleCount++;
        lastCallId = callId;
        lastCaller = msg.sender;
        lastData = data;

        if (autoExecute) {
            // Inject executionIndex = 0 into first 32 bytes after selector
            bytes memory execData = data;
            // bytes 4..35 already hold dummy 0; leave as-is
            (bool ok,) = msg.sender.call(execData);
            require(ok, "autoExecute failed");
        }
    }

    function schedule(bytes calldata data, uint32 gasLimit, uint32 numCalls, uint32 frequency)
        external
        returns (uint256 callId)
    {
        return this.schedule(
            data,
            gasLimit,
            uint32(block.number + frequency),
            numCalls,
            frequency,
            0,
            0,
            0,
            0,
            msg.sender
        );
    }

    function cancel(uint256) external {}

    function approveScheduler(address) external {}

    function getCallState(uint256) external pure returns (uint8) {
        return 0;
    }
}
