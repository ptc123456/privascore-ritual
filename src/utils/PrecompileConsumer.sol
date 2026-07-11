// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Ritual SPC (short-running async) precompile consumer helper.
/// @dev Async precompiles wrap output as (bytes simmedInput, bytes actualOutput).
abstract contract PrecompileConsumer {
    error PrecompileCallFailed(address target);
    error EmptyPrecompileOutput(address target);

    /// @return actualOutput Inner result after unwrapping the async envelope.
    function _executePrecompile(address precompile, bytes memory input)
        internal
        returns (bytes memory actualOutput)
    {
        (bool success, bytes memory rawOutput) = precompile.call(input);
        if (!success) revert PrecompileCallFailed(precompile);
        (, actualOutput) = abi.decode(rawOutput, (bytes, bytes));
        if (actualOutput.length == 0) revert EmptyPrecompileOutput(precompile);
    }

    /// @dev Soft variant: returns empty bytes on empty actualOutput (simulation path).
    function _executePrecompileSoft(address precompile, bytes memory input)
        internal
        returns (bytes memory actualOutput)
    {
        (bool success, bytes memory rawOutput) = precompile.call(input);
        if (!success) revert PrecompileCallFailed(precompile);
        (, actualOutput) = abi.decode(rawOutput, (bytes, bytes));
    }
}
