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
  // Showcase / fallback leaderboard (read-only UX, no wallet required)
  // Prefer live on-chain rows when available; these fill the board for demo.
  showcase: [
    { address: "0x1111111111111111111111111111111111111111", score: 912, tier: 0, reasoning: "Long-lived wallet, diversified DeFi footprint." },
    { address: "0x2222222222222222222222222222222222222222", score: 874, tier: 0, reasoning: "Healthy activity density, low anomaly rate." },
    { address: "0x3333333333333333333333333333333333333333", score: 801, tier: 0, reasoning: "Steady yield farming, clean funding sources." },
    { address: "0x4444444444444444444444444444444444444444", score: 756, tier: 0, reasoning: "Blue-chip NFT holder with multi-year tenure." },
    { address: "0x5555555555555555555555555555555555555555", score: 702, tier: 0, reasoning: "Solid bridges, consistent on-chain cadence." },
    { address: "0x6666666666666666666666666666666666666666", score: 661, tier: 1, reasoning: "Medium trust - solid NFTs, moderate leverage." },
    { address: "0x7777777777777777777777777777777777777777", score: 618, tier: 1, reasoning: "Active trader; some concentration risk." },
    { address: "0x8888888888888888888888888888888888888888", score: 574, tier: 1, reasoning: "Mixed signals: high volume, sparse early history." },
    { address: "0x9999999999999999999999999999999999999999", score: 531, tier: 1, reasoning: "New protocol explorer; limited reputation graph." },
    { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", score: 488, tier: 1, reasoning: "Cross-chain hop pattern needs more seasoning." },
    { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", score: 442, tier: 1, reasoning: "Elevated contract interaction entropy." },
    { address: "0xcccccccccccccccccccccccccccccccccccccccc", score: 389, tier: 2, reasoning: "Short tenure with rapid capital rotation." },
    { address: "0xdddddddddddddddddddddddddddddddddddddddd", score: 327, tier: 2, reasoning: "Elevated risk: sudden inflows and short tenure." },
    { address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", score: 261, tier: 2, reasoning: "Anomaly cluster near known mixer corridors." },
    { address: "0xffffffffffffffffffffffffffffffffffffffff", score: 198, tier: 2, reasoning: "Thin history, high failure rate on approvals." },
    { address: "0x1010101010101010101010101010101010101010", score: 845, tier: 0, reasoning: "Institutional-style custody footprint." },
    { address: "0x2020202020202020202020202020202020202020", score: 793, tier: 0, reasoning: "Stablecoin-heavy, low leverage profile." },
    { address: "0x3030303030303030303030303030303030303030", score: 647, tier: 1, reasoning: "DAO voter with moderate treasury exposure." },
    { address: "0x4040404040404040404040404040404040404040", score: 512, tier: 1, reasoning: "Builder wallet; uneven activity bursts." },
    { address: "0x5050505050505050505050505050505050505050", score: 356, tier: 2, reasoning: "Fresh wallet after large inbound transfer." },
  ],
  /** Max live on-chain rows to fetch from Core.scoredUsers */
  leaderboardLimit: 40,
};

window.STATUS_LABELS = ["None", "DataFetched", "Analyzing", "Settled", "Failed"];
window.TIER_LABELS = ["Low", "Medium", "High"];
