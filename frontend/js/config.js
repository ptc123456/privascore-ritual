/**
 * PrivaScore — Ritual Testnet config
 * Chain ID 1979. Update CORE/AGENT after deploy.
 */
window.PRIVASCORE_CONFIG = {
  chainId: 1979,
  chainIdHex: "0x7bb",
  chainName: "Ritual Testnet",
  rpcUrl: "https://rpc.ritualfoundation.org",
  wsUrl: "wss://rpc.ritualfoundation.org",
  explorerUrl: "https://explorer.ritualfoundation.org",
  nativeCurrency: {
    name: "RITUAL",
    symbol: "RITUAL",
    decimals: 18,
  },
  // Deployed on Ritual Testnet (chain 1979) — override via localStorage if needed
  contracts: {
    token: localStorage.getItem("ps_token") || "0xd66a39bC33354EC20fC03673D3835eC5C50aE42d",
    core: localStorage.getItem("ps_core") || "0xcD3bDa961f452D35420042f5c05685Cad9DfDa33",
    agent: localStorage.getItem("ps_agent") || "0x5F7b3D7BE2171B495C58fF548Ea3C91A3f9E5D85",
  },
  // Minimal ABIs
  abis: {
    core: [
      "function scores(address) view returns (uint256 score, uint8 riskTier, uint256 lastUpdated, bytes32 dataHash, uint8 status, string reasoning)",
      "function tokenIdOf(address) view returns (uint256)",
      "function scoredUserCount() view returns (uint256)",
      "function scoredUsers(uint256) view returns (address)",
      "function getScoreRecord(address) view returns (tuple(uint256 score, uint8 riskTier, uint256 lastUpdated, bytes32 dataHash, uint8 status, string reasoning))",
      "function requestScoreUpdate(address user)",
      "function agent() view returns (address)",
      "function ownerOf(uint256) view returns (address)",
      "event ScoreUpdated(address indexed user, uint256 score, uint8 riskTier, bytes32 dataHash, string reasoning)",
      "event ScoreRequested(address indexed user, address indexed requester)",
    ],
    agent: [
      "function mockMode() view returns (bool)",
      "function fetchData(address user)",
      "function fetchData(address user, string sourceUrl, address executor)",
      "function analyzeScore(uint256 executionIndex, address user)",
      "function analyzeScoreManual(address user)",
      "function requestAndFetch(address user)",
      "function pendingData(address) view returns (bytes)",
      "function analyzePending(address) view returns (bool)",
      "function lastScheduleId(address) view returns (uint256)",
      "event DataFetched(address indexed user, bytes32 dataHash, bool mocked)",
      "event AnalyzeScheduled(address indexed user, uint256 scheduleId, uint32 startBlock)",
      "event ScoreAnalyzed(address indexed user, uint256 score, uint8 tier, bool mocked)",
    ],
  },
  // Showcase leaderboard (read-only UX, no wallet required)
  showcase: [
    {
      address: "0x1111111111111111111111111111111111111111",
      score: 912,
      tier: 0,
      reasoning: "Long-lived wallet, diversified DeFi footprint.",
    },
    {
      address: "0x2222222222222222222222222222222222222222",
      score: 744,
      tier: 0,
      reasoning: "Healthy activity density, low anomaly rate.",
    },
    {
      address: "0x3333333333333333333333333333333333333333",
      score: 518,
      tier: 1,
      reasoning: "Mixed signals: high volume with sparse history.",
    },
    {
      address: "0x4444444444444444444444444444444444444444",
      score: 291,
      tier: 2,
      reasoning: "Elevated risk: sudden inflows and short tenure.",
    },
    {
      address: "0x5555555555555555555555555555555555555555",
      score: 680,
      tier: 1,
      reasoning: "Medium trust — solid NFTs, moderate leverage.",
    },
  ],
};

window.STATUS_LABELS = ["None", "DataFetched", "Analyzing", "Settled", "Failed"];
window.TIER_LABELS = ["Low", "Medium", "High"];
