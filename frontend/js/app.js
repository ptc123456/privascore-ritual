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
      // Newest first, up to limit
      for (let i = count - 1; i >= Math.max(0, count - limit); i--) {
        try {
          const user = await core.scoredUsers(i);
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
        } catch (_) {}
      }
    }

    // Merge showcase wallets not already on-chain so the board always feels full
    const seen = new Set(liveRows.map((r) => r.address.toLowerCase()));
    const fillers = (cfg.showcase || []).filter((r) => !seen.has(r.address.toLowerCase()));
    const merged = liveRows.concat(fillers.map((r) => ({ ...r, live: false })));

    // Sort by score desc for a proper leaderboard feel
    merged.sort((a, b) => Number(b.score) - Number(a.score));

    if (merged.length) {
      const label =
        liveRows.length > 0
          ? `Live on-chain (${liveRows.length})` + (fillers.length ? ` + demo` : "")
          : "Showcase (demo)";
      renderLeaderboard(merged, liveRows.length > 0, label, liveRows.length);
    }
  }

  function loadShowcase() {
    const rows = [...(cfg.showcase || [])].sort((a, b) => Number(b.score) - Number(a.score));
    renderLeaderboard(rows, false, "Showcase (demo)", 0);
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
        readScore();
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

  // ─── Pipeline UI ──────────────────────────────────────────────────────────
  function setPipeline(stage) {
    // stage: 0 idle, 1 fetching, 2 analyzing, 3 settled, 4 failed
    const steps = ["pipe0", "pipe1", "pipe2", "pipe3"];
    steps.forEach((id, i) => {
      const el = $(id);
      if (!el) return;
      el.classList.remove("active", "done");
      const st = el.querySelector(".state");
      if (stage === 4 && i === 3) {
        el.classList.add("active");
        if (st) st.textContent = "Failed";
        return;
      }
      if (i < stage) {
        el.classList.add("done");
        if (st) st.textContent = "Done";
      } else if (i === stage) {
        el.classList.add("active");
        if (st) st.textContent = i === 0 ? "Ready" : "In progress…";
      } else if (st) st.textContent = "Waiting";
    });
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  function randomAddress() {
    const bytes = ethers.randomBytes(20);
    const addr = ethers.getAddress(ethers.hexlify(bytes));
    $("userAddress").value = addr;
    toast("Random address generated");
    return addr;
  }

  async function readScore() {
    const user = ($("userAddress").value || "").trim();
    if (!ethers.isAddress(user)) {
      toast("Enter a valid address");
      return;
    }
    if (!isConfigured()) {
      // Showcase fallback
      const hit = cfg.showcase.find((s) => s.address.toLowerCase() === user.toLowerCase());
      if (hit) {
        showResult(hit.score, hit.tier, hit.reasoning, "Showcase", 3);
        setPipeline(3);
        return;
      }
      toast("Contracts not deployed/configured — try a showcase address or Generate Random + connect after deploy");
      return;
    }
    try {
      const core = new ethers.Contract(cfg.contracts.core, cfg.abis.core, publicProvider);
      const s = await core.scores(user);
      const score = Number(s.score ?? s[0]);
      const tier = Number(s.riskTier ?? s[1]);
      const status = Number(s.status ?? s[4]);
      const reasoning = s.reasoning ?? s[5] ?? "";
      const lastUpdated = s.lastUpdated ?? s[2];
      showResult(score, tier, reasoning, STATUS_LABELS[status] || status, status, lastUpdated);
      setPipeline(status === 3 ? 3 : status === 4 ? 4 : status === 1 ? 1 : status === 2 ? 2 : 0);
      log(`Read ${shortAddr(user)} score=${score} status=${STATUS_LABELS[status]}`);
    } catch (e) {
      toast(e.shortMessage || e.message || "Read failed");
      log("read error: " + (e.message || e));
    }
  }

  function showResult(score, tier, reasoning, statusLabel, status, lastUpdated) {
    const box = $("resultBox");
    if (!box) return;
    const ms = lastUpdated ? Number(lastUpdated) : 0;
    // Ritual timestamps are milliseconds
    const when =
      ms > 1e12
        ? new Date(ms).toLocaleString()
        : ms > 0
          ? new Date(ms * 1000).toLocaleString()
          : "—";
    box.innerHTML = `
      <div class="result-score">${status === 3 || status === undefined ? score : "—"}</div>
      <div style="margin-top:0.5rem">
        <span class="tier-pill ${tierClass(tier)}">${TIER_LABELS[tier] ?? "—"}</span>
        <span class="muted" style="margin-left:0.5rem">Status: ${statusLabel}</span>
      </div>
      <div class="result-meta">Updated: ${when}</div>
      <div class="reasoning">${reasoning || "No reasoning yet."}</div>
    `;
  }

  async function requestScore() {
    const user = ($("userAddress").value || "").trim();
    if (!ethers.isAddress(user)) {
      toast("Enter a valid address");
      return;
    }
    if (!signer) {
      await connectWallet();
      if (!signer) return;
    }
    if (!isConfigured()) {
      toast("Set contract addresses first (config.js / localStorage)");
      return;
    }
    try {
      setPipeline(1);
      const agent = new ethers.Contract(cfg.contracts.agent, cfg.abis.agent, signer);
      // Prefer requestAndFetch (core request + fetch + schedule) when available
      let tx;
      try {
        tx = await agent.requestAndFetch(user, {
          maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
          maxFeePerGas: ethers.parseUnits("30", "gwei"),
        });
      } catch (_) {
        tx = await agent["fetchData(address)"](user, {
          maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
          maxFeePerGas: ethers.parseUnits("30", "gwei"),
        });
      }
      log("tx submitted " + tx.hash);
      toast("Fetch tx submitted…");
      $("explorerLink").href = `${cfg.explorerUrl}/tx/${tx.hash}`;
      $("explorerLink").style.display = "inline";
      const rc = await tx.wait();
      log("fetch confirmed block " + rc.blockNumber);
      setPipeline(2);
      toast("Data fetched — waiting for Scheduler / analyze…");
      startPolling(user);
    } catch (e) {
      setPipeline(4);
      toast(e.shortMessage || e.message || "Tx failed");
      log("request error: " + (e.message || e));
    }
  }

  async function analyzeManual() {
    const user = ($("userAddress").value || "").trim();
    if (!ethers.isAddress(user) || !signer || !isConfigured()) {
      toast("Connect wallet, set address, ensure contracts configured");
      return;
    }
    try {
      setPipeline(2);
      const agent = new ethers.Contract(cfg.contracts.agent, cfg.abis.agent, signer);
      const tx = await agent.analyzeScoreManual(user, {
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
        maxFeePerGas: ethers.parseUnits("30", "gwei"),
      });
      log("analyze tx " + tx.hash);
      await tx.wait();
      toast("Analyze settled");
      setPipeline(3);
      await readScore();
      await loadOnChainStats();
    } catch (e) {
      toast(e.shortMessage || e.message || "Analyze failed");
      log("analyze error: " + (e.message || e));
    }
  }

  function startPolling(user) {
    if (pollTimer) clearInterval(pollTimer);
    let ticks = 0;
    pollTimer = setInterval(async () => {
      ticks++;
      try {
        const core = new ethers.Contract(cfg.contracts.core, cfg.abis.core, publicProvider);
        const s = await core.scores(user);
        const status = Number(s.status ?? s[4]);
        if (status === 1) setPipeline(1);
        if (status === 2) setPipeline(2);
        if (status === 3) {
          setPipeline(3);
          showResult(
            Number(s.score ?? s[0]),
            Number(s.riskTier ?? s[1]),
            s.reasoning ?? s[5],
            "Settled",
            3,
            s.lastUpdated ?? s[2]
          );
          toast("Score settled on-chain");
          clearInterval(pollTimer);
          loadOnChainStats();
        }
        if (status === 4) {
          setPipeline(4);
          clearInterval(pollTimer);
        }
      } catch (_) {}
      if (ticks > 60) {
        clearInterval(pollTimer);
        log("poll timeout — try Analyze Manual if mockMode and schedule lag");
      }
    }, 2000);
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
    setPipeline(0);
    updateAccountStatus(false);

    $("walletBtn")?.addEventListener("click", connectWallet);
    $("btnRandom")?.addEventListener("click", randomAddress);
    $("btnRead")?.addEventListener("click", readScore);
    $("btnRequest")?.addEventListener("click", requestScore);
    $("btnAnalyze")?.addEventListener("click", analyzeManual);
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
