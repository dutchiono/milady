# Milady weekly task plan

## Goal
Recreate last week's productive pattern by focusing on small, painful, mergeable fixes that can land on `develop` after fork validation in `dutchiono/milady`.

## Operating rules for this week
- Work fork-first in `dutchiono/milady`
- Base every branch on `develop`
- Branch names: `codex/<task-name>`
- Prefer one issue or one failure mode per PR
- Open fork PR first for validation and review capture
- Only carry a follow-up into a second PR if it is clearly adjacent and safer split out

## Current issue landscape

### Bucket A — release blockers and packaging failures
These are the highest leverage because they unblock releases and tend to merge quickly.

- [ ] Investigate recurring Electrobun 4-platform release blocker cluster
  - Issues: #1548, #1547, #1545, #1515, #1480, #1479, #1478, #1472, #1471, #1470, #1469, #1468, #1463, #1461, #1460, #1456, #1448, #1443, #1436
  - Desired outcome: identify the single root cause or current dominant failure signature and convert it into one focused fix PR

- [ ] Investigate publish-step failure cluster separately from Electrobun failures
  - Issues: #1477, #1467, #1466, #1465, #1425
  - Desired outcome: verify whether this is workflow drift, tagging permissions, or release job contract breakage

### Bucket B — Ollama regression cluster
These are good tactical bug-fix candidates and align with recent successful work.

- [ ] Fix Ollama provider SDK incompatibility
  - Issue: #1499
  - Hypothesis: provider package is pinned to a spec-v1 implementation that is incompatible with bundled AI SDK 6
  - Desired outcome: either upgrade the provider path or route Ollama through the OpenAI-compatible path in a stable supported way

- [ ] Fix Ollama onboarding persistence across restarts
  - Issue: #1498
  - Hypothesis: onboarding completes without writing `agents.defaults.subscriptionProvider = "ollama"`
  - Desired outcome: persist the provider selection so onboarding state survives relaunch

### Bucket C — Linux desktop lifecycle and installer pain
These are strong user-facing bugs with clear repros.

- [ ] Verify whether Linux close-to-background process leak is still open on current `develop`
  - Issue: #1497
  - Notes: this may overlap with work already attempted; confirm current state before branching

- [ ] Investigate Linux installer symlink/self-extractor failure
  - Issue: #1491
  - Desired outcome: isolate whether the root issue is archive format support, installer extraction logic, or desktop entry post-install setup

### Bucket D — backlog mining from audit issue
This is good filler work if release blockers stall.

- [ ] Mine #1372 into small standalone PR candidates
  - Likely candidates:
    - auth-gate `/api/permissions`
    - add `aria-label` to send button
    - add `role="main"` to primary content
    - improve loader feedback
  - Rule: only pick items that are clearly still unfixed on current `develop`

## Recommended execution order

### Track 1 — highest leverage first
1. Electrobun release blocker cluster
2. Publish-step failure cluster
3. Ollama persistence/runtime fixes

### Track 2 — fast fallback work if Track 1 stalls
4. Linux installer bug
5. Small audit-derived accessibility/auth fixes

## This week's concrete plan

### Monday / first working block
- [ ] Pull current `develop` into the fork
- [ ] Triage the release-blocker issue cluster by current failure signature, not by issue count
- [ ] Choose one dominant release failure to reproduce or inspect
- [ ] Create first branch: `codex/<release-blocker-fix>`

### Next block
- [ ] If release blocker is clear, ship one narrow PR for it
- [ ] If release blocker is noisy or blocked, pivot immediately to Ollama persistence (#1498)
- [ ] Keep the second PR scoped to one root cause only

### Third block
- [ ] Take either Ollama SDK/runtime compatibility (#1499) or Linux installer (#1491)
- [ ] Favor the one with the cleanest repro and smallest safe patch surface

## Productivity checklist for each task
- [ ] Confirm the issue still reproduces on current `develop`
- [ ] Write down the exact failure signature before changing code
- [ ] Keep the patch narrow
- [ ] Add or update one regression test when possible
- [ ] Validate in the fork first
- [ ] Open fork PR with:
  - Summary
  - Validation
  - Handoff / upstream note
- [ ] Only then prepare upstream handoff material

## Anti-patterns to avoid this week
- [ ] Do not start with a giant catch-all cleanup branch
- [ ] Do not mix release, Ollama, and Linux installer fixes in one PR
- [ ] Do not spend the day in duplicate issue noise without collapsing to one root cause
- [ ] Do not keep working locally without converting progress into a PR-sized unit

## Best first bets

### Best bet 1
Electrobun release blocker cluster
- Why: highest repo leverage, likely merge-friendly, probably one repeated failure behind many issues

### Best bet 2
Ollama onboarding persistence (#1498)
- Why: clear repro, narrow likely fix, user-visible, good candidate for a clean regression test

### Best bet 3
Ollama provider incompatibility (#1499)
- Why: strong root-cause writeup already exists, likely high user impact, but may touch dependency strategy and be slightly riskier

## Definition of a good week
- 2 to 4 fork PRs
- Each PR tied to one failure mode
- At least 1 release or startup blocker addressed
- At least 1 smaller tactical fix merged or ready for upstream handoff
- No sprawling branch that hides multiple unrelated fixes
