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
    agent: localStorage.getItem("ps_agent") || "0x9f8A3Fd04bC40a593936B4dfD8798B89Ae1487c5",
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
      "function scoreNow(address user)",
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
  // Showcase / fallback leaderboard — realistic-looking EOAs (not vanity patterns)
  showcase: [
    { address: "0x26A08f064440DDD1fd6fc55d4b241A633AAD8Abf", score: 912, tier: 0, reasoning: "Long-lived wallet, diversified DeFi footprint." },
    { address: "0x7E950af570F19D282841951aAc47578D6DCF6E52", score: 874, tier: 0, reasoning: "Healthy activity density, low anomaly rate." },
    { address: "0x1DCbF7faE56987eeb21D4FEf963ba122FFC90476", score: 845, tier: 0, reasoning: "Institutional-style custody footprint." },
    { address: "0x2C6C523B649284641DFfE53b0e612a1d9f233E57", score: 801, tier: 0, reasoning: "Steady yield farming, clean funding sources." },
    { address: "0xC05f7901dccD5E7D7523Be0fe01b2647918EA851", score: 793, tier: 0, reasoning: "Stablecoin-heavy, low leverage profile." },
    { address: "0x6b809DaBa7e6053ef13500a48353230387E4c989", score: 756, tier: 0, reasoning: "Blue-chip NFT holder with multi-year tenure." },
    { address: "0x91C462eE32216299AFE3379A7bc744B2af857422", score: 702, tier: 0, reasoning: "Solid bridges, consistent on-chain cadence." },
    { address: "0xDa9a85334059a525383cb5F358f0A3fE8F107824", score: 661, tier: 1, reasoning: "Medium trust - solid NFTs, moderate leverage." },
    { address: "0xc450F091574CE986C183B0A167B50393B6537c18", score: 647, tier: 1, reasoning: "DAO voter with moderate treasury exposure." },
    { address: "0x228fFb2Bac0E1547eAeE80d4064d3d053ee71446", score: 618, tier: 1, reasoning: "Active trader; some concentration risk." },
    { address: "0xa1FA3C137F130452482eb0A9B88F99351CEf739e", score: 574, tier: 1, reasoning: "Mixed signals: high volume, sparse early history." },
    { address: "0xC72c24240b959Fe0880AB843E0B5ddA979d40048", score: 531, tier: 1, reasoning: "New protocol explorer; limited reputation graph." },
    { address: "0x1c4670338755880C82a23E14D3b5ceB819787954", score: 512, tier: 1, reasoning: "Builder wallet; uneven activity bursts." },
    { address: "0xf4F77bae9216Bcf79d3c481B416Ab05B4a4449F9", score: 488, tier: 1, reasoning: "Cross-chain hop pattern needs more seasoning." },
    { address: "0xdb589952F6f30d076754537906a4e89619aBd075", score: 442, tier: 1, reasoning: "Elevated contract interaction entropy." },
    { address: "0x0043cB614D5E451834394821fB7e0FdD18A0d671", score: 389, tier: 2, reasoning: "Short tenure with rapid capital rotation." },
    { address: "0xa400A69F972d570266190F7Ee2d926128c093f0C", score: 356, tier: 2, reasoning: "Fresh wallet after large inbound transfer." },
    { address: "0x0993A7787A086653EC8dd1885085467281bdFCaa", score: 327, tier: 2, reasoning: "Elevated risk: sudden inflows and short tenure." },
    { address: "0xB2334017653185Fe3e286d64f268755E8cB3c4EA", score: 261, tier: 2, reasoning: "Anomaly cluster near known mixer corridors." },
    { address: "0xc3f3F4D0fAf6266Cd8E6E784FCA314EEE0BD976D", score: 198, tier: 2, reasoning: "Thin history, high failure rate on approvals." },
  ],
  /** Max live on-chain rows to fetch from Core.scoredUsers */
  leaderboardLimit: 40,
};

window.STATUS_LABELS = ["None", "DataFetched", "Analyzing", "Settled", "Failed"];
window.TIER_LABELS = ["Low", "Medium", "High"];
