/* global ethers, PRIVASCORE_CONFIG, STATUS_LABELS, TIER_LABELS */
(function () {
  "use strict";

  const cfg = window.PRIVASCORE_CONFIG;
  const $ = (id) => document.getElementById(id);

  /** Public read-only provider — loads data without wallet */
  let publicProvider = null;
  let browserProvider = null;
  let signer = null;
  let account = null;
  let pollTimer = null;

  const logLines = [];

  function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logLines.unshift(line);
    if (logLines.length > 40) logLines.pop();
    const el = $("txLog");
    if (el) el.textContent = logLines.join("\n");
    console.log(line);
  }

  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3200);
  }

  function shortAddr(a) {
    if (!a || a.length < 12) return a || "—";
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  }

  function tierClass(t) {
    return t === 0 ? "tier-low" : t === 1 ? "tier-med" : "tier-high";
  }

  function isConfigured() {
    const c = cfg.contracts.core;
    return c && c !== "0x0000000000000000000000000000000000000000";
  }

  /** Hide vanity / placeholder addresses like 0x1111…, 0xaaaa…, 0x1010… */
  function isPlausibleWallet(addr) {
    if (!addr || typeof addr !== "string") return false;
    const h = addr.replace(/^0x/i, "").toLowerCase();
    if (h.length !== 40 || !/^[0-9a-f]{40}$/.test(h)) return false;
    if (/^(.)\1{39}$/.test(h)) return false; // all same nibble
    if (/^([0-9a-f]{2})\1{19}$/.test(h)) return false; // repeating byte pair (e.g. 1010…)
    // Low entropy: <= 3 unique hex chars
    if (new Set(h.split("")).size <= 3) return false;
    return true;
  }

  // ─── Public RPC (no wallet) ───────────────────────────────────────────────
  function initPublic() {
    publicProvider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId, {
      staticNetwork: ethers.Network.from(cfg.chainId),
    });
    updateChainStatus(true);
    loadShowcase();
    loadOnChainStats();
  }

  async function loadOnChainStats() {
    const el = $("onchainStats");
    if (!el) return;
    if (!isConfigured()) {
      el.innerHTML =
        `<span class="muted">Contracts not configured yet. Showcase data shown below. After deploy, set addresses in localStorage (<code>ps_core</code>, <code>ps_agent</code>) or edit <code>js/config.js</code>.</span>`;
      return;
    }
    try {
      const core = new ethers.Contract(cfg.contracts.core, cfg.abis.core, publicProvider);
      const count = await core.scoredUserCount();
      let mock = "—";
      try {
        const agent = new ethers.Contract(cfg.contracts.agent, cfg.abis.agent, publicProvider);
        mock = (await agent.mockMode()) ? "ON (demo-safe)" : "OFF (live precompiles)";
      } catch (_) {}
      el.innerHTML = `
        <div><strong>${count.toString()}</strong> scores settled on-chain</div>
        <div class="muted">Mock mode: ${mock}</div>
        <div class="muted mono" style="margin-top:0.35rem;font-size:0.75rem">Core ${shortAddr(cfg.contracts.core)}</div>
      `;
      // Try live leaderboard from first N scored users
      await loadLiveLeaderboard(core, Number(count));
    } catch (e) {
      el.innerHTML = `<span class="muted">Read-only RPC OK, but contract read failed: ${e.shortMessage || e.message}</span>`;
      log("stats error: " + (e.message || e));
    }
  }

  async function loadLiveLeaderboard(core, count) {
    const tbody = $("leaderboardBody");
    if (!tbody) return;

    const limit = cfg.leaderboardLimit || 40;
    const liveRows = [];
    if (count > 0) {
      // Newest first, up to limit (scan a bit more to skip filtered vanity addresses)
      const scan = Math.min(count, limit * 3);
      for (let i = count - 1; i >= Math.max(0, count - scan); i--) {
        try {
          const user = await core.scoredUsers(i);
          if (!isPlausibleWallet(user)) continue;
          const s = await core.scores(user);
          const status = Number(s.status ?? s[4]);
          if (status !== 3) continue; // only Settled
          liveRows.push({
            address: user,
            score: Number(s.score ?? s[0]),
            tier: Number(s.riskTier ?? s[1]),
            reasoning: s.reasoning ?? s[5] ?? "",
            live: true,
          });
          if (liveRows.length >= limit) break;
        } catch (_) {}
      }
    }

    // Merge realistic showcase wallets not already on-chain
    const seen = new Set(liveRows.map((r) => r.address.toLowerCase()));
    const fillers = (cfg.showcase || []).filter(
      (r) => isPlausibleWallet(r.address) && !seen.has(r.address.toLowerCase())
    );
    const merged = liveRows.concat(fillers.map((r) => ({ ...r, live: false })));

    merged.sort((a, b) => Number(b.score) - Number(a.score));

    if (merged.length) {
      const label =
        liveRows.length > 0
          ? `Live on-chain (${liveRows.length})` + (fillers.length ? ` + sample` : "")
          : "Sample wallets";
      renderLeaderboard(merged, liveRows.length > 0, label, liveRows.length);
    }
  }

  function loadShowcase() {
    const rows = [...(cfg.showcase || [])]
      .filter((r) => isPlausibleWallet(r.address))
      .sort((a, b) => Number(b.score) - Number(a.score));
    renderLeaderboard(rows, false, "Sample wallets", 0);
  }

  function renderLeaderboard(rows, live, label, liveCount) {
    const tbody = $("leaderboardBody");
    const tag = $("lbTag");
    if (!tbody) return;
    if (tag) tag.textContent = label || (live ? "Live on-chain" : "Showcase (demo)");

    const visible = rows.slice(0, cfg.leaderboardLimit || 40);
    const hasMore = rows.length > visible.length;

    tbody.innerHTML =
      visible
        .map((r, idx) => {
          const rank = idx + 1;
          const badge = r.live
            ? `<span class="lb-badge live" title="Settled on Ritual">LIVE</span>`
            : `<span class="lb-badge demo" title="Demo showcase row">DEMO</span>`;
          const note = (r.reasoning || "").length > 72
            ? (r.reasoning || "").slice(0, 72) + "…"
            : (r.reasoning || "");
          return `
      <tr class="${r.live ? "row-live" : "row-demo"}">
        <td class="rank muted">#${rank}</td>
        <td class="addr" title="${r.address}">${shortAddr(r.address)} ${badge}</td>
        <td><strong>${r.score}</strong></td>
        <td><span class="tier-pill ${tierClass(r.tier)}">${TIER_LABELS[r.tier] || r.tier}</span></td>
        <td class="muted note-cell">${note}</td>
        <td><button class="btn btn-sm" data-use="${r.address}">Use</button></td>
      </tr>`;
        })
        .join("") +
      (hasMore
        ? `<tr class="row-more"><td colspan="6" class="muted" style="text-align:center;padding:0.85rem">… and ${rows.length - visible.length} more wallets on the board</td></tr>`
        : visible.length >= 8
          ? `<tr class="row-more"><td colspan="6" class="muted" style="text-align:center;padding:0.85rem">… end of leaderboard · ${visible.length} wallets shown${liveCount ? ` · ${liveCount} live` : ""}</td></tr>`
          : "");

    tbody.querySelectorAll("[data-use]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("userAddress").value = btn.getAttribute("data-use");
        toast("Address loaded");
        checkScore();
      });
    });
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────
  async function connectWallet() {
    if (!window.ethereum) {
      toast("MetaMask not found");
      return;
    }
    try {
      browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      await ensureRitualChain();
      signer = await browserProvider.getSigner();
      account = await signer.getAddress();
      $("walletBtn").textContent = shortAddr(account);
      $("walletBtn").classList.add("btn-primary");
      updateAccountStatus(true);
      log("Connected " + account);
      toast("Wallet connected");
      if (!$("userAddress").value) $("userAddress").value = account;
    } catch (e) {
      log("connect error: " + (e.message || e));
      toast(e.shortMessage || e.message || "Connect failed");
    }
  }

  async function ensureRitualChain() {
    const eth = window.ethereum;
    const id = await eth.request({ method: "eth_chainId" });
    if (parseInt(id, 16) === cfg.chainId) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: cfg.chainIdHex }],
      });
    } catch (switchError) {
      if (switchError.code === 4902 || (switchError.data && switchError.data.originalError?.code === 4902)) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: cfg.chainIdHex,
              chainName: cfg.chainName,
              nativeCurrency: cfg.nativeCurrency,
              rpcUrls: [cfg.rpcUrl],
              blockExplorerUrls: [cfg.explorerUrl],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
  }

  function wireWalletEvents() {
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", (accs) => {
      account = accs && accs[0] ? accs[0] : null;
      if (account) {
        $("walletBtn").textContent = shortAddr(account);
        updateAccountStatus(true);
        log("accountsChanged " + account);
      } else {
        $("walletBtn").textContent = "Connect Wallet";
        $("walletBtn").classList.remove("btn-primary");
        updateAccountStatus(false);
        log("disconnected");
      }
    });
    window.ethereum.on("chainChanged", (cid) => {
      const n = parseInt(cid, 16);
      log("chainChanged " + n);
      updateChainStatus(n === cfg.chainId);
      // Recommended by MetaMask: reload on chain change to reset providers
      window.location.reload();
    });
  }

  function updateChainStatus(ok) {
    const d = $("chainDot");
    const t = $("chainText");
    if (!d || !t) return;
    d.className = "dot " + (ok ? "on" : "warn");
    t.textContent = ok ? `Ritual · ${cfg.chainId}` : "Wrong network";
  }

  function updateAccountStatus(ok) {
    const d = $("acctDot");
    const t = $("acctText");
    if (!d || !t) return;
    d.className = "dot " + (ok ? "on" : "off");
    t.textContent = ok ? shortAddr(account) : "Not connected";
  }

  // ─── Pipeline UI (step 3 NEVER shows the word "Failed") ───────────────────
  // modes: idle | fetching | analyzing | settled | fetch_error | analyze_error
  const PIPE_MODES = {
    idle: {
      texts: ["Ready", "Waiting", "Waiting", "Waiting"],
      cls: ["active", "", "", ""],
    },
    fetching: {
      texts: ["Done", "In progress…", "Waiting", "Waiting"],
      cls: ["done", "active", "", ""],
    },
    analyzing: {
      texts: ["Done", "Done", "In progress…", "Waiting"],
      cls: ["done", "done", "active", ""],
    },
    settled: {
      texts: ["Done", "Done", "Done", "Settled ✓"],
      cls: ["done", "done", "done", "done"],
    },
    fetch_error: {
      texts: ["Done", "Error", "—", "—"],
      cls: ["done", "failed", "", ""],
    },
    analyze_error: {
      texts: ["Done", "Done", "Error", "—"],
      cls: ["done", "done", "failed", ""],
    },
  };

  function setPipeline(modeOrStage, failedAt) {
    // Back-compat: numeric stage / failedAt from older call sites
    let mode = modeOrStage;
    if (typeof modeOrStage === "number") {
      if (failedAt === 1) mode = "fetch_error";
      else if (failedAt === 2 || failedAt === 3) mode = "analyze_error";
      else if (modeOrStage === 0) mode = "idle";
      else if (modeOrStage === 1) mode = "fetching";
      else if (modeOrStage === 2) mode = "analyzing";
      else if (modeOrStage === 3) mode = "settled";
      else if (modeOrStage === 4) mode = "analyze_error"; // never paint step3 as Failed
      else mode = "idle";
    }

    const conf = PIPE_MODES[mode] || PIPE_MODES.idle;
    const root = $("pipeline");
    if (root) root.setAttribute("data-mode", mode);

    for (let i = 0; i < 4; i++) {
      const el = $("pipe" + i);
      const st = $("st" + i) || (el && el.querySelector(".state"));
      if (!el) continue;
      el.classList.remove("active", "done", "failed");
      const c = conf.cls[i];
      if (c) el.classList.add(c);
      // HARD RULE: step 3 (Settled) never displays "Failed" / "Error"
      let text = conf.texts[i];
      if (i === 3 && /fail|error/i.test(String(text))) text = "—";
      if (st) st.textContent = text;
    }
  }

  function parseScores(raw) {
    // Always use positional indices — avoid named Result quirks (e.g. .status)
    return {
      score: Number(raw[0]),
      tier: Number(raw[1]),
      lastUpdated: raw[2],
      dataHash: raw[3],
      status: Number(raw[4]),
      reasoning: raw[5] != null ? String(raw[5]) : "",
    };
  }

  function statusToPipeline(status) {
    // RequestStatus: None=0 DataFetched=1 Analyzing=2 Settled=3 Failed=4
    const n = Number(status);
    if (n === 3) setPipeline("settled");
    else if (n === 4) setPipeline("analyze_error");
    else if (n === 1) setPipeline("fetching");
    else if (n === 2) setPipeline("analyzing");
    else setPipeline("idle");
  }

  function txOk(rc) {
    if (!rc) return true;
    // ethers v6 may use number or bigint
    const s = rc.status;
    if (s === undefined || s === null) return true;
    return Number(s) === 1;
  }

  function friendlyError(e) {
    const msg = e?.shortMessage || e?.reason || e?.message || String(e);
    if (/user rejected|ACTION_REJECTED|denied/i.test(msg)) return "Transaction rejected in wallet.";
    if (/AnalyzeAlreadyPending|already pending/i.test(msg))
      return "Analyze already pending — wait for the Scheduler or click Analyze Manual.";
    if (/NoPendingData|no pending/i.test(msg))
      return "No pending fetch data — click Request Update first.";
    if (/insufficient|funds|gas/i.test(msg)) return "Insufficient RITUAL for gas / Scheduler fees.";
    if (/network|chain/i.test(msg)) return "Wrong network — switch MetaMask to Ritual (1979).";
    return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
  }

  async function syncFromChain(user, { toastSettled } = {}) {
    if (!isConfigured() || !ethers.isAddress(user)) return null;
    const core = new ethers.Contract(cfg.contracts.core, cfg.abis.core, publicProvider);
    const raw = await core.scores(user);
    const s = parseScores(raw);
    showResult(s.score, s.tier, s.reasoning, STATUS_LABELS[s.status] || s.status, s.status, s.lastUpdated);
    statusToPipeline(s.status);
    log(`Sync ${shortAddr(user)} score=${s.score} status=${STATUS_LABELS[s.status] || s.status}`);
    if (toastSettled && s.status === 3) toast("Score settled on-chain");
    return s;
  }

  // ─── Actions (read-only lookup — no wallet, no transfer) ──────────────────
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Deterministic demo score when address has no on-chain settlement yet */
  function simulateScore(address) {
    const h = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
    const n = Number(BigInt(h) % 1000n);
    let tier = 0;
    let reasoning = "Healthy on-chain footprint with diversified activity.";
    if (n >= 666) {
      tier = 2;
      reasoning = "Elevated risk signals — short tenure or anomalous flow patterns.";
    } else if (n >= 333) {
      tier = 1;
      reasoning = "Mixed signals — moderate volume with uneven history density.";
    }
    return {
      score: n,
      tier,
      reasoning,
      status: 3,
      lastUpdated: Date.now(),
      source: "Simulated",
    };
  }

  function showResult(score, tier, reasoning, statusLabel, status, lastUpdated) {
    const box = $("resultBox");
    if (!box) return;
    const ms = lastUpdated ? Number(lastUpdated) : 0;
    const when =
      ms > 1e12
        ? new Date(ms).toLocaleString()
        : ms > 0
          ? new Date(ms * 1000).toLocaleString()
          : "—";
    const settled = Number(status) === 3 || status === undefined;
    box.innerHTML = `
      <div class="result-score">${settled ? score : "—"}</div>
      <div style="margin-top:0.5rem">
        <span class="tier-pill ${tierClass(tier)}">${settled ? TIER_LABELS[tier] ?? "—" : "—"}</span>
        <span class="muted" style="margin-left:0.5rem">${statusLabel}</span>
      </div>
      <div class="result-meta">Updated: ${when}</div>
      <div class="reasoning">${reasoning || "No reasoning available."}</div>
    `;
  }

  /**
   * Main UX: paste address → Check Score.
   * Never opens MetaMask, never sends a transaction.
   */
  async function checkScore() {
    const user = ($("userAddress").value || "").trim();
    if (!ethers.isAddress(user)) {
      toast("Enter a valid address");
      return;
    }

    const btn = $("btnCheck");
    if (btn) btn.disabled = true;

    try {
      // Visual pipeline only (no chain writes)
      setPipeline("fetching");
      await sleep(220);
      setPipeline("analyzing");
      await sleep(280);

      // 1) Showcase sample (instant)
      const sample = (cfg.showcase || []).find(
        (s) => s.address.toLowerCase() === user.toLowerCase()
      );

      // 2) On-chain read via public RPC (no wallet)
      let onchain = null;
      if (isConfigured()) {
        try {
          const core = new ethers.Contract(cfg.contracts.core, cfg.abis.core, publicProvider);
          onchain = parseScores(await core.scores(user));
        } catch (e) {
          log("rpc read: " + (e.message || e));
        }
      }

      setPipeline("settled");

      if (onchain && onchain.status === 3) {
        showResult(
          onchain.score,
          onchain.tier,
          onchain.reasoning,
          "On-chain · Settled",
          3,
          onchain.lastUpdated
        );
        toast("Score loaded from chain");
        log(`Lookup ${shortAddr(user)} on-chain score=${onchain.score}`);
      } else if (sample) {
        showResult(sample.score, sample.tier, sample.reasoning, "Sample board", 3, Date.now());
        toast("Score loaded from sample board");
        log(`Lookup ${shortAddr(user)} sample score=${sample.score}`);
      } else {
        // Any address still gets a deterministic simulated result (no tx)
        const sim = simulateScore(user);
        showResult(sim.score, sim.tier, sim.reasoning, "Simulated (read-only)", 3, sim.lastUpdated);
        toast("Simulated score (not written on-chain)");
        log(`Lookup ${shortAddr(user)} simulated score=${sim.score}`);
      }
    } catch (e) {
      setPipeline("fetch_error");
      toast(friendlyError(e));
      log("check error: " + (e.message || e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function saveAddresses() {
    const core = $("cfgCore").value.trim();
    const agent = $("cfgAgent").value.trim();
    const token = $("cfgToken").value.trim();
    if (core) {
      localStorage.setItem("ps_core", core);
      cfg.contracts.core = core;
    }
    if (agent) {
      localStorage.setItem("ps_agent", agent);
      cfg.contracts.agent = agent;
    }
    if (token) {
      localStorage.setItem("ps_token", token);
      cfg.contracts.token = token;
    }
    toast("Addresses saved locally");
    loadOnChainStats();
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    initPublic();
    wireWalletEvents();
    setPipeline("idle");
    updateAccountStatus(false);

    $("walletBtn")?.addEventListener("click", connectWallet);
    $("btnCheck")?.addEventListener("click", checkScore);
    $("userAddress")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") checkScore();
    });
    $("btnSaveCfg")?.addEventListener("click", saveAddresses);

    if ($("cfgCore")) $("cfgCore").value = cfg.contracts.core;
    if ($("cfgAgent")) $("cfgAgent").value = cfg.contracts.agent;
    if ($("cfgToken")) $("cfgToken").value = cfg.contracts.token;

    log("Public RPC ready → " + cfg.rpcUrl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
