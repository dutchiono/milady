# Plugin EVM Runtime Investigation

Date: 2026-04-02
Repo: `dutchiono/milady`
Branch: `codex/plugin-evm-runtime-note`

## Scope

Trace how `@elizaos/plugin-evm` is actually used in the agent runtime and where the current code can claim EVM capability without the plugin being loaded.

## Grounded Findings

### 1. `@elizaos/plugin-evm` is installed but not auto-enabled by runtime plugin collection

The package is present in the repo dependency graph:

- `package.json`
- `bun.lock`

But the runtime auto-enable and collection paths do not add it automatically:

- `packages/agent/src/runtime/core-plugins.ts`
- `packages/agent/src/runtime/plugin-collector.ts`
- `packages/agent/src/config/plugin-auto-enable.ts`

What is missing:

- no `plugin-evm` entry in `CORE_PLUGINS`
- no `plugin-evm` entry in `OPTIONAL_CORE_PLUGINS`
- no `plugin-evm` entry in `PROVIDER_PLUGIN_MAP`
- no `plugin-evm` entry in `OPTIONAL_PLUGIN_MAP`
- no `plugin-evm` entry in `AUTH_PROVIDER_PLUGINS`
- no `plugin-evm` entry in `FEATURE_PLUGINS`

Result:

- `resolvePlugins()` calls `applyPluginAutoEnable()` and then `collectPluginNames()`
- neither path auto-adds `@elizaos/plugin-evm`
- `plugin-evm` only gets loaded if it is explicitly present in config, install records, or another manual load path

This means "the package exists in the repo" is not the same thing as "the runtime loaded it."

### 2. The API does have a real runtime-level loaded check

The server-side wallet capability path checks actual runtime plugin registration with:

- `packages/agent/src/api/server.ts`
- `packages/agent/src/api/chat-augmentation.ts`

Both use `isPluginLoadedByName(runtime, "@elizaos/plugin-evm")`.

That is the correct question when the issue is "did the runtime actually load the plugin module?"

### 3. `/api/wallet/config` uses a different and weaker definition of "plugin loaded"

`packages/agent/src/api/wallet-routes.ts` currently does this:

- `pluginEvmLoaded = localSignerAvailable || Boolean(addresses.evmAddress)`

That is not a runtime plugin check.

It treats these as equivalent:

- local EVM private key exists
- managed EVM address exists
- `plugin-evm` is loaded

They are not equivalent.

Practical consequence:

- wallet config can report `pluginEvmLoaded: true` even when `@elizaos/plugin-evm` was never resolved into `runtime.plugins`
- this can make debugging much harder because one API surface says "loaded" while runtime-aware surfaces say "not loaded"

### 4. Chat execution has a direct fallback path that can bypass model-selected tool use

The main chat path in `packages/agent/src/api/chat-routes.ts` has two wallet fallback behaviors:

- direct wallet execution dispatch from prompt intent
- recovery from unexecuted action payload

Those paths call `executeFallbackParsedActions(...)` when the model either:

- never emits an action payload
- emits one that does not get executed

This matters because it means wallet execution can still happen through server-side fallback logic even when the model is not reliably invoking tools.

So there are at least three distinct states that can get conflated:

1. `plugin-evm` package exists in the repo
2. `plugin-evm` is actually loaded into the runtime
3. wallet execution still succeeds via fallback action routing

### 5. The plugin diagnostics UI partially knows this, but the system is still inconsistent

`packages/agent/src/api/server.ts` builds a synthetic "Plugin EVM" diagnostic entry via `buildPluginEvmDiagnosticEntry(...)`.

That helper uses the real runtime check:

- `pluginEvmLoaded = isPluginLoadedByName(runtime, EVM_PLUGIN_PACKAGE)`

But because `wallet-routes.ts` uses a weaker shortcut for `/api/wallet/config`, the product currently exposes inconsistent answers depending on which endpoint you ask.

## Most Likely Failure Modes

### Failure mode A: package installed, plugin not loaded

Symptoms:

- the repo has `@elizaos/plugin-evm`
- runtime does not auto-enable it
- wallet/chat diagnostics can disagree about loaded state

Root cause:

- no runtime auto-enable path for `plugin-evm`

### Failure mode B: runtime plugin missing, but wallet fallback still executes

Symptoms:

- the model appears to "do wallet stuff"
- execution may happen through server fallback logic
- this can look like plugin-evm worked when it did not

Root cause:

- chat fallback execution path is independent from "LLM explicitly chose the plugin action"

### Failure mode C: diagnostics say loaded when only a key/address exists

Symptoms:

- `/api/wallet/config` reports `pluginEvmLoaded: true`
- runtime-aware checks report the plugin is not loaded

Root cause:

- endpoint-level diagnostic shortcut in `packages/agent/src/api/wallet-routes.ts`

## Immediate Fixes Worth Making

### 1. Unify `plugin-evm loaded` detection

Use one runtime-aware helper everywhere:

- `true` only when `isPluginLoadedByName(runtime, "@elizaos/plugin-evm")`
- do not infer plugin load from wallet address presence or local keys

First target:

- `packages/agent/src/api/wallet-routes.ts`

### 2. Decide whether `plugin-evm` should auto-enable

If the intended product behavior is "wallet-ready config should load EVM support automatically," add a real auto-enable path based on explicit wallet prerequisites such as:

- `EVM_PRIVATE_KEY`
- wallet plugin config entry
- explicit wallet/EVM feature toggle

The change should land in:

- `packages/agent/src/config/plugin-auto-enable.ts`
or
- `packages/agent/src/runtime/plugin-collector.ts`

### 3. Log the final runtime plugin set at startup and restart

Add a clear startup log proving whether `@elizaos/plugin-evm` is present in the resolved runtime plugin set.

That removes ambiguity when debugging local desktop vs cloud/container behavior.

### 4. Add one test that asserts disagreement cannot happen

The missing regression test should prove:

- when `plugin-evm` is not in `runtime.plugins`, every API surface reports "not loaded"
- a local key or managed address alone does not flip the loaded bit

## Bottom Line

The main issue is not just "the model talks instead of acting."

The concrete repo-level issue is that `plugin-evm` currently sits in an inconsistent state:

- not auto-enabled by runtime plugin collection
- checked correctly in some runtime-aware paths
- inferred incorrectly in at least one wallet config path
- partially bypassed by direct server-side wallet fallback execution

That makes it easy to misread logs, UI, and runtime behavior when debugging BSC or Eliza Cloud wallet execution.
