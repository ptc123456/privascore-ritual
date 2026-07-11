// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPrivaScoreCore {
    enum RequestStatus {
        None,
        DataFetched,
        Analyzing,
        Settled,
        Failed
    }

    struct ScoreRecord {
        uint256 score;
        uint8 riskTier;
        uint256 lastUpdated;
        bytes32 dataHash;
        RequestStatus status;
        string reasoning;
    }

    function scores(address user)
        external
        view
        returns (
            uint256 score,
            uint8 riskTier,
            uint256 lastUpdated,
            bytes32 dataHash,
            RequestStatus status,
            string memory reasoning
        );

    function requestScoreUpdate(address user) external;

    function setRequestStatus(address user, RequestStatus status) external;

    function fulfillScore(
        address user,
        uint256 score,
        uint8 tier,
        bytes32 dataHash,
        string calldata reasoning
    ) external;

    function markFailed(address user, string calldata reason) external;

    function agent() external view returns (address);
}
