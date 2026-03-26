# Wallet + PR Master Handoff (Cross-Account)

**Authoring date:** 2026-03-26 (America/New_York)
**Purpose:** complete transfer of context to another account with minimal re-discovery
**Primary focus:** wallet execution path, plugin-evm alignment, and current open PR stack

---

## 1) Executive Summary

You currently have **5 open PRs** in `milady-ai/milady` from `dutchiono`:

1. [PR #1343](https://github.com/milady-ai/milady/pull/1343) - issue #1170 ordered task execution
2. [PR #1358](https://github.com/milady-ai/milady/pull/1358) - Windows crash telemetry/supportability
3. [PR #1361](https://github.com/milady-ai/milady/pull/1361) - zh-CN companion input unlock
4. [PR #1362](https://github.com/milady-ai/milady/pull/1362) - docs/onboarding support expansion
5. [PR #1363](https://github.com/milady-ai/milady/pull/1363) - wallet routing (0x + fallback + UX)

As of this handoff, all five have completed check runs with only **`Agent Review Verdict`** failing.

Wallet status in plain terms:
- Wallet behavior is significantly improved in `#1363` (network mode, route provider support, safer action semantics).
- However, runtime still depended on Milady local wallet routes/actions in most deployed paths.
- A new commit was created to force plugin-first direction (`plugin-evm` auto-load/mapping), but it is currently on **local branch `codex/integration-all` only** and is **not yet in PR #1363**.

That commit is:
- `3393ed59` - `fix(wallet): enable plugin-evm auto-loading from wallet env/config`

---

## 2) Repos/Workspaces You Should Use

Because parallel worktrees/folders got messy, use these two paths only:

1. **Main repo root** (authoritative git metadata):
   - `C:\Users\epj33\Documents\Playground\milady`

2. **Integration worktree** (contains latest integration branch state):
   - `C:\Users\epj33\Documents\Playground\milady-integration-all`

Do not resume work in old duplicate folders.

---

## 3) Current Branch Inventory (Important)

### Main active branches
- `codex/issue-1170` -> PR #1343
- `codex/win-reporting` -> PR #1358
- `codex/zh-cn-input-lock` -> PR #1361
- `codex/docs-onboarding-support` -> PR #1362
- `codex/wallet-routing` -> PR #1363
- `codex/integration-all` -> local integration branch (not a PR yet)

### Integration branch content
`codex/integration-all` currently contains merges of all five PR branches + one extra commit:
- merge `codex/issue-1170`
- merge `codex/win-reporting`
- merge `codex/zh-cn-input-lock`
- merge `codex/docs-onboarding-support`
- merge `codex/wallet-routing`
- plus `3393ed59` plugin-evm activation work

---

## 4) Live PR Snapshot (as of 2026-03-26)

Source: GitHub REST API (`repos/milady-ai/milady/pulls`, `commits/{sha}/check-runs`)

### PR #1343
- URL: [#1343](https://github.com/milady-ai/milady/pull/1343)
- Branch: `codex/issue-1170`
- SHA: `101416783388593c9fd3d95bc18770aaf63d18c7`
- Check runs: 38 total
- Failed checks: `Agent Review Verdict`
- Pending checks: 0

### PR #1358
- URL: [#1358](https://github.com/milady-ai/milady/pull/1358)
- Branch: `codex/win-reporting`
- SHA: `d2f823142a1d59cd5ed63b44e2c4521561c9dda1`
- Check runs: 31 total
- Failed checks: `Agent Review Verdict`
- Pending checks: 0

### PR #1361
- URL: [#1361](https://github.com/milady-ai/milady/pull/1361)
- Branch: `codex/zh-cn-input-lock`
- SHA: `a81c45bd7ead39408ae427019fea7b2fb7473937`
- Check runs: 29 total
- Failed checks: `Agent Review Verdict`
- Pending checks: 0

### PR #1362
- URL: [#1362](https://github.com/milady-ai/milady/pull/1362)
- Branch: `codex/docs-onboarding-support`
- SHA: `71fc32fa87b99ca750e6264a897cf6f6fdea6ecd`
- Check runs: 29 total
- Failed checks: `Agent Review Verdict`
- Pending checks: 0

### PR #1363
- URL: [#1363](https://github.com/milady-ai/milady/pull/1363)
- Branch: `codex/wallet-routing`
- SHA: `33ff10ae0268a4ca841295312bcfb55fd40dbc41`
- Check runs: 31 total
- Failed checks: `Agent Review Verdict`
- Pending checks: 0

### Related merged PR
- [PR #1341](https://github.com/milady-ai/milady/pull/1341) - merged

---

## 5) Wallet Work: What Is Implemented

Implemented primarily on `codex/wallet-routing` / PR #1363:

1. **Route provider support (`auto` / `0x` / `pancakeswap-v2`)**
- Request/contract path supports provider selection for trade quote/execute.
- Relevant code: `packages/agent/src/api/wallet-trade-routes.ts`

2. **Mainnet/testnet network mode support**
- Added network-aware RPC resolution and BSC testnet support paths.
- Relevant code: `packages/agent/src/api/wallet-rpc.ts`, `packages/agent/src/api/bsc-trade.ts`

3. **Safety semantics improved for agent actions**
- `EXECUTE_TRADE` / `TRANSFER_TOKEN` now return `success: false` when tx not actually executed (prevents false-positive “done” heartbeat behavior).
- Relevant files:
  - `packages/app-core/src/actions/execute-trade.ts`
  - `packages/app-core/src/actions/transfer-token.ts`

4. **Trade ledger and tests improved**
- Added API-level and state machine tests around route/ledger behavior.

---

## 6) Wallet Work: What Is NOT Done (Critical)

This is the gap you explicitly care about: **“NO CUSTOM LOGIC, get plugin-evm working.”**

### Still true on PR #1363 today
- Wallet execution still uses Milady route/action wrappers:
  - `/api/wallet/trade/execute`
  - `/api/wallet/transfer/execute`
  - action wrappers (`EXECUTE_TRADE`, `TRANSFER_TOKEN`, `CHECK_BALANCE`)
- Plugin-evm is present as dependency but not fully established as canonical runtime path in PR #1363 alone.

### Local fix created (not yet merged into #1363)
Commit: `3393ed59`

What it does:
1. Adds `@elizaos/plugin-evm` to optional core plugin list
   - `packages/agent/src/runtime/core-plugins.ts`
2. Adds static runtime module mapping + optional aliases (`evm`, `wallet`)
   - `packages/agent/src/runtime/eliza.ts`
3. Adds env-driven auto-load triggers for plugin-evm (`EVM_PRIVATE_KEY`, `BSC_RPC_URL`, etc.)
   - `packages/agent/src/runtime/eliza.ts`
   - `packages/agent/src/config/plugin-auto-enable.ts`
4. Adds tests proving plugin-evm auto-activation behavior
   - `packages/app-core/src/runtime/eliza.test.ts`
   - `packages/app-core/src/config/plugin-auto-enable.test.ts`

Validation performed on that commit:
- `bunx vitest run packages/app-core/src/runtime/eliza.test.ts packages/app-core/src/config/plugin-auto-enable.test.ts` ?
- `bun run typecheck` ?

### Why this matters
Without this commit (or equivalent), wallet behavior remains mostly Milady custom path + plugin optionality, not plugin-first operation.

---

## 7) Wallet Architecture Reality (Current)

### Current execution flow (deployed PR #1363 path)
1. LLM selects action:
   - `EXECUTE_TRADE` or `TRANSFER_TOKEN` or `CHECK_BALANCE`
2. Action wrapper calls local API:
   - `/api/wallet/trade/execute`
   - `/api/wallet/transfer/execute`
3. Route executes quote/build/sign/send using local route deps and RPC readiness.
4. Returns execution object (or unsigned tx path).

### Key files to inspect first
- `packages/agent/src/api/wallet-trade-routes.ts`
- `packages/agent/src/api/bsc-trade.ts`
- `packages/agent/src/api/wallet-rpc.ts`
- `packages/app-core/src/actions/execute-trade.ts`
- `packages/app-core/src/actions/transfer-token.ts`
- `packages/app-core/src/actions/check-balance.ts`

### Plugin-evm activation points (new local integration commit)
- `packages/agent/src/runtime/core-plugins.ts`
- `packages/agent/src/runtime/eliza.ts`
- `packages/agent/src/config/plugin-auto-enable.ts`

---

## 8) Exact Work Remaining for Wallet Track

Priority-ordered:

1. **Move plugin-evm activation commit into PR #1363**
- cherry-pick `3393ed59` onto `codex/wallet-routing`
- push branch
- rerun checks

2. **Decide hard policy: plugin-evm authoritative vs wrapper compatibility mode**
- Option A (recommended): wrappers remain thin compatibility shims, plugin-evm executes.
- Option B: deprecate wrappers and route through plugin-only action set.

3. **Map conversational intents to plugin-evm actions explicitly**
- Ensure no ambiguity from duplicate action names.
- Confirm dedup/order rules in plugin registration avoid wrong action winning.

4. **TDD for chain behavior matrix**
- EVM mainnet + testnet route selection
- BSC + Base + ETH basic tx send/trade behavior
- failure classes: 401/429/provider down/rpc down/slippage/insufficient funds

5. **User-facing routing transparency**
- UI should always show provider and route used (`0x`, fallback, chain, rpc source).

6. **Wallet lifecycle UX debt (known but not fixed)**
- import/export flow quality
- onboarding wallet generation timing
- repeated wallet creation/lost key risk mitigation

---

## 9) End-to-End Test Plan for Next Account (Wallet/Chain)

### Local prep
1. open `C:\Users\epj33\Documents\Playground\milady-integration-all`
2. `bun install --ignore-scripts`
3. `bun run postinstall`

### Fast safety gates
1. `bun run typecheck`
2. `bunx vitest run packages/app-core/src/runtime/eliza.test.ts packages/app-core/src/config/plugin-auto-enable.test.ts`
3. wallet slices:
   - `bunx vitest run packages/app-core/src/actions/execute-trade.test.ts`
   - `bunx vitest run packages/app-core/src/actions/transfer-token.test.ts`
   - `bunx vitest run packages/agent/src/api/wallet-trade-routes.test.ts`
   - `bunx vitest run packages/agent/src/api/__tests__/wallet-rpc-network.test.ts`
   - `bunx vitest run packages/agent/src/api/__tests__/bsc-trade-network.test.ts`

### Manual conversational chain test (must-do)
1. Start app with wallet key and RPC env set.
2. Ask natural language actions:
   - “check my balance on BSC/Base/Solana”
   - “send small tx on testnet”
   - “trade token with route provider set to 0x”
3. Verify:
   - action actually executes on-chain when it reports success
   - if not executed, action returns failure/needs-signature state
   - route/provider shown clearly

---

## 10) PR-by-PR Operational Notes

### #1343 (Issue #1170 stream)
- Very large ordered task stream.
- It includes extra follow-up fixes mixed after T01-T30, so reviewers may challenge strict scope discipline.
- Functional state appears strong; still open.

### #1358 (Windows supportability)
- Core work done and valuable for field debugging.
- Great for immediate support signal in Chinese community crash reports.

### #1361 (zh-CN input lock)
- Focused, small, should be easy to merge if reviewers agree.

### #1362 (docs/onboarding)
- Mostly copy/docs/help flow improvements.
- Should pair with support funnel + bug-report flow from #1358.

### #1363 (wallet routing)
- High-impact MVP blocker because chain actions are user-visible and trust-critical.
- Needs plugin-evm canonicalization step from `3393ed59`.

---

## 11) Suggested Immediate Sequence (If Credits/Time Are Tight)

1. Land easy, high-confidence PRs first:
- #1361
- #1362
- #1358

2. Then wallet:
- apply/cherry-pick `3393ed59` into `codex/wallet-routing`
- rerun wallet + plugin slices
- update #1363 description to explicitly state plugin-evm first-class loading behavior

3. Keep #1343 separate due breadth.

---

## 12) Cherry-Pick Instructions for Next Account

From `C:\Users\epj33\Documents\Playground\milady`:

```powershell
git checkout codex/wallet-routing
git fetch fork
# optional: rebase on latest develop if team wants
git cherry-pick 3393ed59
bunx vitest run packages/app-core/src/runtime/eliza.test.ts packages/app-core/src/config/plugin-auto-enable.test.ts
bun run typecheck
git push fork codex/wallet-routing
```

Then verify PR #1363 checks:
- [PR #1363 checks](https://github.com/milady-ai/milady/pull/1363/checks)

---

## 13) Known Risks / Open Questions

1. **Action ownership ambiguity**
- If plugin-evm and Milady wrappers define overlapping intent/action surfaces, runtime ordering/dedupe may still produce non-obvious selection.

2. **Cloud-vs-BYOK routing confusion**
- Users report perceived cloud credit use while expecting OpenRouter/local path.
- Needs explicit telemetry and UI route/source indicator for every inference + chain call.

3. **Wallet identity persistence UX**
- complaints about key churn/new wallets on relaunch suggest lifecycle policy confusion or bugs around onboarding key generation/import semantics.

4. **Chain standards parity expectation**
- Team expectation is BNKR-like conversational reliability.
- Current stack is close but still requires deterministic execution guarantees and clearer failure semantics.

---

## 14) Source Links Index

### PRs
- [PR #1341](https://github.com/milady-ai/milady/pull/1341) (merged)
- [PR #1343](https://github.com/milady-ai/milady/pull/1343)
- [PR #1358](https://github.com/milady-ai/milady/pull/1358)
- [PR #1361](https://github.com/milady-ai/milady/pull/1361)
- [PR #1362](https://github.com/milady-ai/milady/pull/1362)
- [PR #1363](https://github.com/milady-ai/milady/pull/1363)

### Existing plan docs
- `docs/plans/2026-03-26-master-delivery-board.md`
- `docs/plans/2026-03-26-wallet-routing-and-ux-parity.md`
- `docs/plans/2026-03-26-windows-crash-telemetry-supportability.md`
- `docs/plans/2026-03-26-zh-cn-companion-input-lock.md`
- `docs/plans/2026-03-26-docs-onboarding-support-expansion.md`
- `docs/plans/2026-03-26-issue-1170-execution.md`

### Branches/worktrees used in this handoff
- `codex/wallet-routing`
- `codex/integration-all`
- workspace: `C:\Users\epj33\Documents\Playground\milady`
- workspace: `C:\Users\epj33\Documents\Playground\milady-integration-all`

---

## 15) Final Transfer Note

If only one thing gets carried over correctly, carry this:

> `#1363` should absorb `3393ed59` so wallet execution direction is plugin-evm-first, then lock behavior with TDD across testnet/mainnet conversational flows.

That is the shortest path to reducing user-visible wallet trust failures before beta launch.

---

## 13.1) Why Cloud Says "I will do that" But Send/Swap Does Not Execute

This symptom from QA (assistant replies with intent language, no real tx) usually means conversational inference succeeded but tool/action execution failed or never ran.

### Most probable causes in this repo

1. **LLM acknowledgement without action call execution**
- The assistant text can promise action, but runtime may not emit/execute the actual wallet action payload that turn.

2. **Action-path ambiguity (wrapper actions vs plugin actions)**
- Milady has wrapper actions (`EXECUTE_TRADE`, `TRANSFER_TOKEN`, `CHECK_BALANCE`) while plugin-based action surfaces can also exist.
- If registration order/dedupe chooses the wrong path, you get conversational confirmation without on-chain submit.

3. **Prepared/unsigned path returned instead of executed path**
- Routes can return "prepared"/"requires signature" responses.
- Commit `33ff10ae` improved this by failing action success when not executed, but cloud/runtime path mismatches can still bypass clean signaling.

4. **Cloud runtime missing signer/permission context for write path**
- Reads (balances) can work from cloud/public RPC while writes (send/swap) require signer + permission + nonce/approval + route execution.
- That explains: "balances work, send/swap says okay but does nothing."

5. **Route-provider inconsistency under `auto`**
- If `auto` routing bounces between providers/fallback behavior, read vs write reliability diverges and execution can become non-deterministic.

### Why TX reading is "hit or miss"

- Read path dependencies differ from write path.
- Reads tolerate partial RPC availability; writes need stricter full-chain state + signer correctness.
- So partial success on balances does not imply swap/send readiness.

### Immediate diagnostics for next account

1. Log action selection and execution every turn:
- `action_selected`
- `action_executed`
- `execution_mode`
- `route_provider`
- `tx_hash`

2. Treat success strictly:
- No `tx_hash` and no `executed: true` => do **not** report success.

3. Confirm which implementation handled the turn:
- wrapper action vs plugin-evm action (must be explicit in logs).

4. Test with forced provider first:
- run explicit `routeProvider: "0x"`, then fallback scenario, then `auto`.

5. Verify signer context in cloud-conversation runtime:
- ensure same runtime that receives chat turn has wallet key + permission mode allowing submission.

### Required fix direction (policy)

- Make plugin-evm canonical for execution path (not merely installed).
- Keep wrappers as compatibility shims only, or remove ambiguity.
- Enforce invariant: **no tx hash => no success** in all conversational wallet actions.
