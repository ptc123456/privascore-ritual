// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev CRITICAL: use fallback() not named function - avoids double ABI-encode envelope issues.
contract MockLLMPrecompile {
    struct StorageRef {
        string platform;
        string path;
        string keyRef;
    }

    fallback(bytes calldata input) external returns (bytes memory) {
        // Include "score":742 in raw completion bytes so _findScore can extract it
        bytes memory completionData =
            bytes('{"score":742,"tier":0,"reasoning":"Solid on-chain footprint."}');
        bytes memory modelMeta = bytes("");
        string memory errorMsg = "";
        StorageRef memory convo = StorageRef({platform: "", path: "", keyRef: ""});
        // (bool hasError, bytes completionData, bytes modelMetadata, string errorMessage, StorageRef)
        bytes memory actualOutput =
            abi.encode(false, completionData, modelMeta, errorMsg, convo);
        return abi.encode(input, actualOutput);
    }
}
