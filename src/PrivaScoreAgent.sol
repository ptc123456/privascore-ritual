// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";
import {IPrivaScoreCore} from "./interfaces/IPrivaScoreCore.sol";
import {IScheduler} from "./interfaces/IScheduler.sol";
import {IRitualWallet} from "./interfaces/IRitualWallet.sol";

/// @title PrivaScoreAgent - Autonomous multi-step scoring agent on Ritual
/// @notice Step 1: HTTP precompile (or mock) -> pending data
///         Step 2: Scheduler triggers analyzeScore -> LLM (or mock) -> Core.fulfillScore
/// @dev One short-running async precompile per transaction. Never call HTTP + LLM in same tx.
contract PrivaScoreAgent is Ownable, PrecompileConsumer {
    /// @notice DA StorageRef for LLM convoHistory (required even when empty)
    struct StorageRef {
        string platform;
        string path;
        string keyRef;
    }

    // --- Ritual constants ----------------------------------------------------
    address public constant HTTP_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    address public constant LLM_PRECOMPILE = 0x0000000000000000000000000000000000000802;
    address public constant ASYNC_DELIVERY = 0x5A16214fF555848411544b005f7Ac063742f39F6;
    address public constant RITUAL_WALLET = 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948;
    address public constant SCHEDULER_ADDR = 0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B;

    string public constant LLM_MODEL = "zai-org/GLM-4.7-FP8";

    IPrivaScoreCore public immutable core;
    IScheduler public immutable scheduler;

    bool public mockMode = true; // Safe default for demo stability
    address public defaultExecutor;
    string public defaultSourceUrl =
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

    uint32 public scheduleGas = 300_000;
    uint32 public scheduleTtl = 80;
    uint32 public scheduleDelayBlocks = 1;
    uint256 public scheduleMaxFeePerGas = 5 gwei;
    uint256 public scheduleMaxPriorityFeePerGas = 1 gwei;

    mapping(address => bytes) public pendingData;
    mapping(address => uint256) public lastScheduleId;
    mapping(address => bool) public analyzePending;

    // Optional long-running async delivery storage
    mapping(bytes32 => address) public jobUser;
    string public lastDeliveryResult;

    error ZeroAddress();
    error NoPendingData();
    error AnalyzeAlreadyPending();
    error UnauthorizedCallback();
    error UnauthorizedScheduler();
    error EmptySourceUrl();
    error MockModeRequired();

    event MockModeUpdated(bool enabled);
    event DataFetched(address indexed user, bytes32 dataHash, bool mocked);
    event AnalyzeScheduled(address indexed user, uint256 scheduleId, uint32 startBlock);
    event ScoreAnalyzed(address indexed user, uint256 score, uint8 tier, bool mocked);
    event AsyncDeliveryReceived(bytes32 indexed jobId, address indexed user, string result);
    event ExecutorUpdated(address indexed executor);

    constructor(address initialOwner, address _core, address _scheduler)
        Ownable(initialOwner)
    {
        if (_core == address(0) || _scheduler == address(0)) revert ZeroAddress();
        core = IPrivaScoreCore(_core);
        scheduler = IScheduler(_scheduler);
        // Allow Scheduler system contract to act as payer for scheduled callbacks
        try IScheduler(_scheduler).approveScheduler(_scheduler) {} catch {}
    }

    // ─── Owner config ────────────────────────────────────────────────────────

    function setMockMode(bool _mock) external onlyOwner {
        mockMode = _mock;
        emit MockModeUpdated(_mock);
    }

    function setDefaultExecutor(address _executor) external onlyOwner {
        defaultExecutor = _executor;
        emit ExecutorUpdated(_executor);
    }

    function setDefaultSourceUrl(string calldata url) external onlyOwner {
        defaultSourceUrl = url;
    }

    function setScheduleParams(
        uint32 gasLimit,
        uint32 ttl,
        uint32 delayBlocks,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas
    ) external onlyOwner {
        scheduleGas = gasLimit;
        scheduleTtl = ttl;
        scheduleDelayBlocks = delayBlocks;
        scheduleMaxFeePerGas = maxFeePerGas;
        scheduleMaxPriorityFeePerGas = maxPriorityFeePerGas;
    }

    /// @notice Fund RitualWallet for precompile + scheduled execution fees
    function depositForFees(uint256 lockDuration) external payable onlyOwner {
        IRitualWallet(RITUAL_WALLET).deposit{value: msg.value}(lockDuration);
    }

    // ─── Public entry ────────────────────────────────────────────────────────

    /// @notice Request a full autonomous score: Core status + fetchData + schedule analyze
    function requestAndFetch(address user) external {
        core.requestScoreUpdate(user);
        fetchData(user, defaultSourceUrl, defaultExecutor);
    }

    /// @notice Fast demo path: mock fetch + analyze + settle in a SINGLE transaction.
    /// @dev Only available when mockMode=true. No Scheduler, no precompile wait.
    function scoreNow(address user) external {
        if (!mockMode) revert MockModeRequired();
        if (user == address(0)) revert ZeroAddress();

        // Allow re-score even if a prior schedule left pending flags set
        analyzePending[user] = false;

        bytes memory dataBody = _mockHttpBody(user);
        pendingData[user] = dataBody;
        bytes32 dataHash = keccak256(dataBody);
        core.setRequestStatus(user, IPrivaScoreCore.RequestStatus.DataFetched);
        emit DataFetched(user, dataHash, true);

        core.setRequestStatus(user, IPrivaScoreCore.RequestStatus.Analyzing);
        (uint256 score, uint8 tier, string memory reasoning) = _mockAnalyze(user, dataBody);
        if (score > 999) score = 999;

        core.fulfillScore(user, score, tier, dataHash, reasoning);
        delete pendingData[user];
        analyzePending[user] = false;

        emit ScoreAnalyzed(user, score, tier, true);
    }

    /// @notice Step 1 — HTTP (or mock) data fetch, then schedule Step 2
    function fetchData(address user, string memory sourceUrl, address executor) public {
        if (user == address(0)) revert ZeroAddress();
        if (bytes(sourceUrl).length == 0) revert EmptySourceUrl();
        if (analyzePending[user]) revert AnalyzeAlreadyPending();

        bytes memory dataBody;

        if (mockMode) {
            dataBody = _mockHttpBody(user);
        } else {
            address exec = executor == address(0) ? defaultExecutor : executor;
            if (exec == address(0)) revert ZeroAddress();
            dataBody = _realHttpFetch(exec, sourceUrl);
        }

        pendingData[user] = dataBody;
        bytes32 dataHash = keccak256(dataBody);
        core.setRequestStatus(user, IPrivaScoreCore.RequestStatus.DataFetched);
        emit DataFetched(user, dataHash, mockMode);

        // Mock mode: settle inline in the same tx (fast UX). Real mode uses Scheduler.
        if (mockMode) {
            analyzePending[user] = false;
            core.setRequestStatus(user, IPrivaScoreCore.RequestStatus.Analyzing);
            (uint256 score, uint8 tier, string memory reasoning) = _mockAnalyze(user, dataBody);
            if (score > 999) score = 999;
            core.fulfillScore(user, score, tier, dataHash, reasoning);
            delete pendingData[user];
            emit ScoreAnalyzed(user, score, tier, true);
            return;
        }

        _scheduleAnalyze(user);
    }

    /// @notice Convenience overload using defaults
    function fetchData(address user) external {
        fetchData(user, defaultSourceUrl, defaultExecutor);
    }

    /// @notice Step 2 — LLM (or mock) analysis. Scheduler injects executionIndex as first arg.
    /// @dev First param MUST be uint256 executionIndex (Scheduler overwrites bytes 4-35).
    function analyzeScore(uint256 /* executionIndex */, address user) external {
        // Allow scheduler or anyone (EOA can also trigger if schedule failed; demo-friendly)
        if (pendingData[user].length == 0) revert NoPendingData();

        analyzePending[user] = false;
        core.setRequestStatus(user, IPrivaScoreCore.RequestStatus.Analyzing);

        bytes memory data = pendingData[user];
        bytes32 dataHash = keccak256(data);

        uint256 score;
        uint8 tier;
        string memory reasoning;

        if (mockMode) {
            (score, tier, reasoning) = _mockAnalyze(user, data);
        } else {
            (score, tier, reasoning) = _realLlmAnalyze(user, data);
        }

        // Bound score
        if (score > 999) score = 999;

        core.fulfillScore(user, score, tier, dataHash, reasoning);
        delete pendingData[user];

        emit ScoreAnalyzed(user, score, tier, mockMode);
    }

    /// @notice Manual trigger if scheduler is unavailable (same as scheduled path)
    function analyzeScoreManual(address user) external {
        this.analyzeScore(0, user);
    }

    /// @notice AsyncDelivery callback for long-running / two-phase paths (safety + tests)
    function onAsyncDelivery(bytes32 jobId, bytes calldata result) external {
        if (msg.sender != ASYNC_DELIVERY) revert UnauthorizedCallback();
        address user = jobUser[jobId];
        // Decode optional (bool success, bytes data)
        if (result.length > 0) {
            lastDeliveryResult = string(result);
        }
        emit AsyncDeliveryReceived(jobId, user, lastDeliveryResult);
    }

    // ─── Internal: schedule ──────────────────────────────────────────────────

    function _scheduleAnalyze(address user) internal {
        analyzePending[user] = true;

        // Scheduler overwrites first uint256 (executionIndex) at execution time
        bytes memory data =
            abi.encodeWithSelector(this.analyzeScore.selector, uint256(0), user);

        uint32 startBlock = uint32(block.number) + scheduleDelayBlocks;

        uint256 callId = scheduler.schedule(
            data,
            scheduleGas,
            startBlock,
            uint32(1), // numCalls — one-shot
            uint32(1), // frequency
            scheduleTtl,
            scheduleMaxFeePerGas,
            scheduleMaxPriorityFeePerGas,
            uint256(0),
            address(this) // payer = this agent (RitualWallet balance)
        );

        lastScheduleId[user] = callId;
        emit AnalyzeScheduled(user, callId, startBlock);
    }

    // ─── Mock mode ───────────────────────────────────────────────────────────

    function _mockHttpBody(address user) internal view returns (bytes memory) {
        // Deterministic pseudo on-chain activity JSON
        bytes32 h = keccak256(abi.encode(user, block.number, block.timestamp));
        uint256 txCount = (uint256(h) % 500) + 1;
        uint256 volume = (uint256(h >> 8) % 1_000_000) + 100;
        uint256 ageDays = (uint256(h >> 16) % 1000) + 1;
        return abi.encodePacked(
            '{"address":"',
            _toHex(user),
            '","txCount":',
            _u(txCount),
            ',"volumeUsd":',
            _u(volume),
            ',"walletAgeDays":',
            _u(ageDays),
            ',"source":"mock"}'
        );
    }

    function _mockAnalyze(address user, bytes memory data)
        internal
        pure
        returns (uint256 score, uint8 tier, string memory reasoning)
    {
        bytes32 h = keccak256(abi.encode(user, data));
        score = uint256(h) % 1000;
        if (score < 333) {
            tier = 0;
            reasoning = "Mock: Low risk - healthy activity profile.";
        } else if (score < 666) {
            tier = 1;
            reasoning = "Mock: Medium risk - mixed behavioral signals.";
        } else {
            tier = 2;
            reasoning = "Mock: High risk - elevated anomaly indicators.";
        }
    }

    // ─── Real precompile paths ───────────────────────────────────────────────

    function _realHttpFetch(address executor, string memory url)
        internal
        returns (bytes memory body)
    {
        // HTTP request: 13 fields per ritual-dapp-http
        bytes memory input = abi.encode(
            executor,
            new bytes[](0), // encryptedSecrets
            uint256(100), // ttl
            new bytes[](0), // secretSignatures
            bytes(""), // userPublicKey
            url,
            uint8(1), // GET
            new string[](0),
            new string[](0),
            bytes(""), // body
            uint256(0), // dkmsKeyIndex
            uint8(0), // dkmsKeyFormat
            false // piiEnabled
        );

        bytes memory actualOutput = _executePrecompileSoft(HTTP_PRECOMPILE, input);
        if (actualOutput.length == 0) {
            // Simulation / unsettled — store placeholder; scheduler will re-run with result
            return abi.encodePacked('{"status":"pending","url":"', url, '"}');
        }

        (uint16 statusCode,,,, string memory errorMessage) =
            abi.decode(actualOutput, (uint16, string[], string[], bytes, string));

        if (bytes(errorMessage).length > 0 || statusCode >= 400) {
            return abi.encodePacked(
                '{"error":true,"status":', _u(statusCode), ',"msg":"', errorMessage, '"}'
            );
        }

        (,,, body,) = abi.decode(actualOutput, (uint16, string[], string[], bytes, string));
    }

    function _realLlmAnalyze(address user, bytes memory data)
        internal
        returns (uint256 score, uint8 tier, string memory reasoning)
    {
        address executor = defaultExecutor;
        if (executor == address(0)) {
            // Fallback to mock-derived score if no executor configured
            return _mockAnalyze(user, data);
        }

        string memory messagesJson = string(
            abi.encodePacked(
                '[{"role":"system","content":"You are PrivaScore risk analyst. Reply ONLY with JSON: {\\"score\\":0-999,\\"tier\\":0|1|2,\\"reasoning\\":\\"short\\"}"},',
                '{"role":"user","content":"Score wallet ',
                _toHex(user),
                " with data: ",
                string(data),
                '"}]'
            )
        );

        // LLM 30-field request - empty convoHistory StorageRef is required
        StorageRef memory emptyConvo = StorageRef({platform: "", path: "", keyRef: ""});
        bytes memory input = abi.encode(
            executor,
            new bytes[](0),
            uint256(300),
            new bytes[](0),
            bytes(""),
            messagesJson,
            LLM_MODEL,
            int256(0),
            "",
            false,
            int256(4096),
            "",
            "",
            uint256(1),
            true,
            int256(0),
            "medium",
            bytes(""),
            int256(-1),
            "auto",
            "",
            false,
            int256(300),
            bytes(""),
            bytes(""),
            int256(-1),
            int256(1000),
            "",
            false,
            emptyConvo
        );

        bytes memory actualOutput = _executePrecompileSoft(LLM_PRECOMPILE, input);
        if (actualOutput.length == 0) {
            return _mockAnalyze(user, data);
        }

        (bool hasError, bytes memory completionData,, string memory errorMsg,) =
            abi.decode(actualOutput, (bool, bytes, bytes, string, StorageRef));

        if (hasError || completionData.length == 0) {
            // Freeform error — fall back so demo does not brick
            (score, tier, reasoning) = _mockAnalyze(user, data);
            reasoning = string(
                abi.encodePacked(
                    "LLM error fallback: ", errorMsg, " | ", reasoning
                )
            );
            return (score, tier, reasoning);
        }

        // Best-effort: completion is nested ABI; for robustness use hash of completion as score
        // and attach a short reasoning tag. Full nested CompletionData decode is complex on-chain.
        (score, tier, reasoning) = _parseOrFallback(user, data, completionData);
    }

    function _parseOrFallback(address user, bytes memory data, bytes memory completionData)
        internal
        pure
        returns (uint256 score, uint8 tier, string memory reasoning)
    {
        // Search for "score":NNN pattern in raw bytes (may include nested encoding noise)
        int256 found = _findScore(completionData);
        if (found >= 0) {
            score = uint256(found);
            tier = score < 333 ? 0 : (score < 666 ? 1 : 2);
            reasoning = "LLM structured score extracted on-chain.";
            return (score, tier, reasoning);
        }
        return _mockAnalyze(user, data);
    }

    function _findScore(bytes memory b) internal pure returns (int256) {
        // Look for ASCII: "score": then digits
        bytes memory key = bytes('"score":');
        if (b.length < key.length + 1) return -1;
        for (uint256 i = 0; i + key.length < b.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < key.length; j++) {
                if (b[i + j] != key[j]) {
                    match_ = false;
                    break;
                }
            }
            if (!match_) continue;
            uint256 k = i + key.length;
            // skip spaces
            while (k < b.length && b[k] == 0x20) k++;
            uint256 val = 0;
            bool any;
            while (k < b.length && b[k] >= 0x30 && b[k] <= 0x39) {
                any = true;
                val = val * 10 + (uint8(b[k]) - 48);
                k++;
                if (val > 999) break;
            }
            if (any && val <= 999) return int256(val);
        }
        return -1;
    }

    // ─── String helpers ──────────────────────────────────────────────────────

    function _toHex(address a) internal pure returns (string memory) {
        bytes20 data = bytes20(a);
        bytes memory hexChars = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = hexChars[uint8(data[i] >> 4)];
            str[3 + i * 2] = hexChars[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }

    function _u(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (v != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(v % 10)));
            v /= 10;
        }
        return string(buffer);
    }

    receive() external payable {}
}
