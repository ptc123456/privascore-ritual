# PrivaScore · Ritual Testnet

Autonomous **risk & trust scoring** on [Ritual](https://ritualfoundation.org) (EVM++).  
An agent contract fetches data via the **HTTP precompile** (`0x0801`), schedules the next step with the **Scheduler**, then runs **LLM inference** (`0x0802`) and settles a **soulbound ERC-721** credential on-chain.

| Network | Value |
|--------|--------|
| Chain ID | `1979` |
| RPC | `https://rpc.ritualfoundation.org` |
| Explorer | `https://explorer.ritualfoundation.org` |
| Faucet | `https://faucet.ritualfoundation.org` |

## Architecture

```
User / UI
   │  requestAndFetch(user)
   ▼
PrivaScoreAgent ──HTTP 0x0801──► pendingData[user]
   │  schedule(analyzeScore)
   ▼  (next blocks, system TxScheduled)
PrivaScoreAgent ──LLM 0x0802──► parse score/tier
   │  fulfillScore
   ▼
PrivaScoreCore  → Soulbound NFT + ScoreRecord + PRIVA reward
```

**Constraint:** only **one** short-running async precompile per transaction — hence the two-step / multi-block design.

**Mock Mode (default `true`):** owner can toggle `setMockMode`. When enabled, HTTP/LLM are simulated on-chain so demos remain stable if TEE executors are flaky.

## Contracts

| Contract | Role |
|----------|------|
| `PrivaToken` | ERC-20 reward (minted on first settlement) |
| `PrivaScoreCore` | Score ledger + soulbound ERC-721 + on-chain `tokenURI` |
| `PrivaScoreAgent` | Precompile consumer + Scheduler integration |

System contracts (do not redeploy):

- Scheduler `0x56e776BAE2DD60664b69Bd5F865F1180ffB7D58B`
- RitualWallet `0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948`
- AsyncDelivery `0x5A16214fF555848411544b005f7Ac063742f39F6`

Scheduler ABI used (official `ritual-dapp-scheduler`):

```solidity
function schedule(
  bytes data, uint32 gas, uint32 startBlock, uint32 numCalls,
  uint32 frequency, uint32 ttl, uint256 maxFeePerGas,
  uint256 maxPriorityFeePerGas, uint256 value, address payer
) external returns (uint256 callId);
```

`analyzeScore(uint256 executionIndex, address user)` — first arg is overwritten by Scheduler.

## Develop

Requirements: [Foundry](https://book.getfoundry.sh/) (forge/cast).

```bash
forge build
forge test
```

Config: `shanghai`, solc `0.8.20`, `via_ir = true`.

## Deploy (Ritual Testnet)

1. Fund the deployer from the [faucet](https://faucet.ritualfoundation.org).
2. **Never commit private keys.** Use `.env` (gitignored):

```bash
cp .env.example .env
# set PRIVATE_KEY=...
```

3. Broadcast (**priority fee ≥ 1 gwei**, **no `--legacy`**):

```bash
# PowerShell
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"
# load PRIVATE_KEY from .env without printing it
forge script script/Deploy.s.sol:Deploy `
  --rpc-url https://rpc.ritualfoundation.org `
  --broadcast `
  --priority-gas-price 1000000000 `
  -vvvv
```

4. Optional wallet deposit for scheduled fees (ABI: `deposit(uint256 lockDuration)` payable):

```bash
cast send 0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948 `
  "deposit(uint256)" 50000 `
  --value 0.05ether `
  --rpc-url https://rpc.ritualfoundation.org `
  --private-key $env:PRIVATE_KEY `
  --priority-gas-price 1000000000
```

5. Paste Core / Agent / Token addresses into the frontend (`frontend/js/config.js` or localStorage keys `ps_core`, `ps_agent`, `ps_token`).

## Deployed addresses (Ritual Testnet)

| Contract | Address |
|----------|---------|
| PrivaToken | [`0xd66a39bC33354EC20fC03673D3835eC5C50aE42d`](https://explorer.ritualfoundation.org/address/0xd66a39bC33354EC20fC03673D3835eC5C50aE42d) |
| PrivaScoreCore | [`0xcD3bDa961f452D35420042f5c05685Cad9DfDa33`](https://explorer.ritualfoundation.org/address/0xcD3bDa961f452D35420042f5c05685Cad9DfDa33) |
| PrivaScoreAgent | [`0x9f8A3Fd04bC40a593936B4dfD8798B89Ae1487c5`](https://explorer.ritualfoundation.org/address/0x9f8A3Fd04bC40a593936B4dfD8798B89Ae1487c5) |

See `deployments/ritual-testnet.json`. Mock mode is **on** by default. Sample flow: `fetchData` registered a Scheduler job; analyze settled on-chain without a second user click.

## Frontend

Static site under `frontend/`:

- `index.html` — landing
- `app.html` — dashboard (public RPC first, MetaMask optional)

```bash
# local preview
cd frontend && npx --yes serve .
```

## Ritual gotchas (from Academy Workshop)

1. Precompile **mocks must use `fallback`**, not named returns (avoid double ABI-encode).
2. Prefer `via_ir` / structs for stack depth.
3. `block.timestamp` is **milliseconds** on Ritual.
4. Priority fee **&lt; 1 gwei** → tx can vanish silently.
5. Do **not** use `--legacy`.
6. AsyncDelivery callbacks: `require(msg.sender == AsyncDelivery)`.
7. LLM calls must include `convoHistory` (empty tuple is OK).

## License

MIT

## Live links

- GitHub: https://github.com/ptc123456/privascore-ritual
- Frontend (Vercel): https://privascore-rose.vercel.app
- App dashboard: https://privascore-rose.vercel.app/app.html
