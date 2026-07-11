// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {PrivaToken} from "./PrivaToken.sol";
import {IPrivaScoreCore} from "./interfaces/IPrivaScoreCore.sol";

/// @title PrivaScoreCore — Soulbound credential ledger for on-chain risk scores
/// @notice ERC-721 SBT (non-transferable) + score ledger. Only the Agent may fulfill scores.
/// @dev Ritual: block.timestamp is milliseconds — store and display accordingly.
contract PrivaScoreCore is ERC721, Ownable, IPrivaScoreCore {
    using Strings for uint256;

    uint256 public constant REWARD_AMOUNT = 10 ether; // 10 PRIVA per settlement

    PrivaToken public immutable privaToken;
    address public agent;
    uint256 private _nextTokenId = 1;

    mapping(address => ScoreRecord) private _scores;
    mapping(address => uint256) public tokenIdOf;
    mapping(uint256 => address) public tokenOwnerOf; // tokenId => subject address
    address[] public scoredUsers;
    mapping(address => bool) public hasBeenScored;

    error OnlyAgent();
    error ZeroAddress();
    error Soulbound();
    error InvalidScore();
    error InvalidTier();

    event AgentUpdated(address indexed previous, address indexed current);
    event ScoreRequested(address indexed user, address indexed requester);
    event ScoreUpdated(
        address indexed user,
        uint256 score,
        uint8 riskTier,
        bytes32 dataHash,
        string reasoning
    );
    event ScoreFailed(address indexed user, string reason);

    modifier onlyAgent() {
        if (msg.sender != agent) revert OnlyAgent();
        _;
    }

    constructor(address initialOwner, address _privaToken)
        ERC721("PrivaScore Credential", "PRIVASBT")
        Ownable(initialOwner)
    {
        if (_privaToken == address(0)) revert ZeroAddress();
        privaToken = PrivaToken(_privaToken);
    }

    function setAgent(address _agent) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        emit AgentUpdated(agent, _agent);
        agent = _agent;
    }

    /// @inheritdoc IPrivaScoreCore
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
        )
    {
        ScoreRecord storage r = _scores[user];
        return (r.score, r.riskTier, r.lastUpdated, r.dataHash, r.status, r.reasoning);
    }

    function getScoreRecord(address user) external view returns (ScoreRecord memory) {
        return _scores[user];
    }

    function scoredUserCount() external view returns (uint256) {
        return scoredUsers.length;
    }

    /// @notice Open entrypoint — anyone can request a score update for any address.
    function requestScoreUpdate(address user) external {
        if (user == address(0)) revert ZeroAddress();
        _scores[user].status = RequestStatus.None;
        emit ScoreRequested(user, msg.sender);
    }

    /// @inheritdoc IPrivaScoreCore
    function setRequestStatus(address user, RequestStatus status) external onlyAgent {
        _scores[user].status = status;
    }

    /// @inheritdoc IPrivaScoreCore
    function fulfillScore(
        address user,
        uint256 score,
        uint8 tier,
        bytes32 dataHash,
        string calldata reasoning
    ) external onlyAgent {
        if (user == address(0)) revert ZeroAddress();
        if (score > 999) revert InvalidScore();
        if (tier > 2) revert InvalidTier();

        ScoreRecord storage r = _scores[user];
        r.score = score;
        r.riskTier = tier;
        r.lastUpdated = block.timestamp; // Ritual: milliseconds
        r.dataHash = dataHash;
        r.status = RequestStatus.Settled;
        r.reasoning = reasoning;

        uint256 tid = tokenIdOf[user];
        if (tid == 0) {
            tid = _nextTokenId++;
            tokenIdOf[user] = tid;
            tokenOwnerOf[tid] = user;
            _safeMint(user, tid);
        }

        if (!hasBeenScored[user]) {
            hasBeenScored[user] = true;
            scoredUsers.push(user);
            // Reward first settlement
            privaToken.mint(user, REWARD_AMOUNT);
        }

        emit ScoreUpdated(user, score, tier, dataHash, reasoning);
    }

    /// @inheritdoc IPrivaScoreCore
    function markFailed(address user, string calldata reason) external onlyAgent {
        _scores[user].status = RequestStatus.Failed;
        emit ScoreFailed(user, reason);
    }

    // ─── Soulbound: block transfers, allow mint/burn ─────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Allow mint (from == 0) and burn (to == 0); block peer transfers
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function transferFrom(address, address, uint256) public pure override {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert Soulbound();
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ─── On-chain tokenURI (base64 JSON) ─────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        address subject = tokenOwnerOf[tokenId];
        ScoreRecord memory r = _scores[subject];

        string memory tierName = _tierName(r.riskTier);
        string memory json = string(
            abi.encodePacked(
                '{"name":"PrivaScore #',
                tokenId.toString(),
                '","description":"Soulbound risk & trust credential on Ritual.",',
                '"attributes":[',
                '{"trait_type":"Score","value":',
                r.score.toString(),
                '},',
                '{"trait_type":"Risk Tier","value":"',
                tierName,
                '"},',
                '{"trait_type":"Subject","value":"',
                Strings.toHexString(uint160(subject), 20),
                '"}',
                '],"reasoning":"',
                _escape(r.reasoning),
                '"}'
            )
        );

        return string(
            abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json)))
        );
    }

    function _tierName(uint8 tier) internal pure returns (string memory) {
        if (tier == 0) return "Low";
        if (tier == 1) return "Medium";
        return "High";
    }

    function _escape(string memory s) internal pure returns (string memory) {
        // Minimal JSON escape for quotes/newlines in reasoning
        bytes memory b = bytes(s);
        if (b.length == 0) return "";
        // Cap length for gas; full escape is expensive
        uint256 len = b.length > 200 ? 200 : b.length;
        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\" || c == "\n" || c == "\r") {
                out[i] = 0x20; // space
            } else {
                out[i] = c;
            }
        }
        return string(out);
    }
}
