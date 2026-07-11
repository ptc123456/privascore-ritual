// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev CRITICAL: use fallback() not named function — avoids double ABI-encode envelope issues.
contract MockHTTPPrecompile {
    fallback(bytes calldata input) external returns (bytes memory) {
        // HTTP response: (uint16 status, string[] keys, string[] vals, bytes body, string err)
        string[] memory empty;
        bytes memory body =
            bytes('{"txCount":120,"volumeUsd":45000,"walletAgeDays":400,"source":"mock-http"}');
        bytes memory actualOutput = abi.encode(uint16(200), empty, empty, body, "");
        return abi.encode(input, actualOutput);
    }
}
