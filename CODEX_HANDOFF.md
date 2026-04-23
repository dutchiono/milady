# Codex Handoff: Milady local install/build and agent release

Date: 2026-04-23

## Current Folder

Repo: `C:\Users\epj33\Documents\Playground\milady`

Current branch: `wip/local-install-stability-20260423`

Base commit: `bf5bde1557b789ac46c05321d39d2d52dfe10784`

That base is current `origin/develop` as of this handoff:

```powershell
git rev-parse HEAD
git rev-parse origin/develop
```

Both should print `bf5bde1557b789ac46c05321d39d2d52dfe10784`.

## Why This Branch Exists

The repo was previously checked out detached at `origin/develop` because local `develop` had one unique stale commit:

```text
36c9d415b ci: authorize fork owner for manual release
```

To avoid losing anything, I preserved it as:

```text
backup/local-develop-36c9d41
```

Then I attached the current dirty working state to:

```text
wip/local-install-stability-20260423
```

No new folder/worktree was created.

## Local Proof

These commands passed in `C:\Users\epj33\Documents\Playground\milady`:

```powershell
bun install
bun run build
```

Use this to launch locally:

```powershell
bun run dev:desktop
```

## Current Local Changes

Top-level dirty files:

```text
bun.lock
scripts/setup-upstreams.mjs
scripts/setup-upstreams.test.ts
eliza
```

Submodule dirty files:

```text
eliza/packages/app-core/patches/llama-cpp-capacitor@0.1.5.patch
eliza/plugins/plugin-local-embedding/typescript/src/index.ts
```

The `llama-cpp-capacitor` patch fix changes the hunk header count from `7` to `6`.

The `plugin-local-embedding` fix casts the `Buffer` passed to `fs.readSync` as `Uint8Array` to satisfy current Node typings.

The top-level `setup-upstreams` changes make normal local installs stop rebuilding already-present `@elizaos/core` output and stop building every missing upstream plugin artifact outside CI/explicit force mode.

## Validation Already Run

Focused tests:

```powershell
bunx vitest run scripts/setup-upstreams.test.ts -t "ensureElizaBuildOutputs|applyPluginLocalEmbeddingNodeTypesPatch|ensurePluginBuildOutputs"
```

Result: passed, 4 tests.

Full file test note:

```powershell
bunx vitest run scripts/setup-upstreams.test.ts
```

This still has unrelated pre-existing Windows expectation failures around path separators, TypeScript ignoreDeprecations expected values, and `bun` vs `bun-types`.

## Agent Release State

Latest checked org run:

```text
https://github.com/milady-ai/milady/actions/runs/24832362251
```

SHA:

```text
bf5bde1557b789ac46c05321d39d2d52dfe10784
```

Run result: failed.

Green jobs included:

```text
Evaluate & authorize
Resolve version
Flatpak build
Snap build
Debian package build
npm package build
Docs validation
Homepage build
iOS build validation
PyPI package build
macOS App Store build validation
Cloud app image build
Agent image build
Prepare Release
Validate Release Inputs
Build Agent Browser Bridge companions
```

Failed jobs:

```text
Android AAB build
Electrobun full matrix / Build Windows
Electrobun full matrix / Build macOS (Intel)
Electrobun full matrix / Build Linux
Electrobun full matrix / Build macOS (Apple Silicon)
```

Useful command to inspect again:

```powershell
gh api repos/milady-ai/milady/actions/runs/24832362251/jobs --paginate --jq '.jobs[] | [.name,.status,.conclusion,.html_url] | @tsv'
```

## Safe Next Steps

To keep working on local install stability:

```powershell
cd C:\Users\epj33\Documents\Playground\milady
git status --short --branch
bun install
bun run build
```

To return local `develop` to current remote after preserving the old local commit:

```powershell
git switch develop
git merge --ff-only origin/develop
```

If that fails because `develop` still diverges, preserve current state first, then reset only if you intentionally want local `develop` to exactly match remote:

```powershell
git branch backup/local-develop-before-reset develop
git branch -f develop origin/develop
git switch develop
```

Do not delete `backup/local-develop-36c9d41` until the old local manual-release authorization commit is confirmed obsolete.

## Account Switch Notes

Before pushing after account switch:

```powershell
gh auth status
git remote -v
```

For upstream Milady org work, verify you are authenticated as the intended account and have `repo` plus `workflow` scopes.

Do not push fork-only runner hacks to `milady-ai/milady`. Org workflow runner labels should stay on the intended Blacksmith labels.
