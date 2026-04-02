# Backend Retarget Pickup

## Branch

- local branch: `codex/backend-revamp-retarget`
- intended remote: `dutchiono`
- repo base used for retarget: fresh `origin/develop` as of `2026-04-02`

## What Landed

This worktree retargets the earlier backend/Convex revamp work onto current `develop` boundaries instead of the older monolithic app/server shape.

The main landed slices are:

1. Backend migration seam on current `develop`
- shared backend config/runtime status helpers in `packages/shared`
- explicit top-level backend config with compatibility for legacy database provider settings
- backend-aware database/config/status/test routes
- Convex activation/runtime selection plumbing

2. Real Convex trajectory vertical slice
- real Convex app in `convex/schema.ts` and `convex/trajectories.ts`
- trajectory runtime dispatch between legacy SQL and Convex
- trajectory route proof for list/detail/stats/delete/clear/config
- app UI for trajectory blocked/active states on current page layout

3. Secret-model alignment to current elizaOS/Milady standard
- `CONVEX_ADMIN_KEY` treated as a normal managed secret through `/api/secrets`
- backend config only contains non-secret Convex settings
- docs updated to point users to Secrets / `env` instead of `backend.convex.adminKey`

4. Conversation/backend compatibility pass
- `/api/conversations` now includes backend status
- conversation delete returns backend-aware cleanup metadata
- active non-`legacy-sql` backends report persisted cleanup limitations instead of pretending SQL cleanup is available
- chat loaders surface one-time warnings when conversation refresh happens under a non-SQL backend
- reset/wipe flow now logs backend cleanup warnings returned while clearing conversations

## Important Files

- `packages/shared/src/backend.ts`
- `packages/shared/src/contracts/config.ts`
- `packages/agent/src/runtime/convex.ts`
- `packages/agent/src/runtime/trajectory-convex.ts`
- `packages/agent/src/runtime/trajectory-storage.ts`
- `packages/agent/src/runtime/trajectory-query.ts`
- `packages/agent/src/api/database.ts`
- `packages/agent/src/api/trajectory-routes.ts`
- `packages/agent/src/api/conversation-routes.ts`
- `packages/agent/src/api/plugin-discovery-helpers.ts`
- `packages/agent/src/api/plugin-routes.ts`
- `packages/app-core/src/components/pages/DatabaseView.tsx`
- `packages/app-core/src/components/pages/SecretsView.tsx`
- `packages/app-core/src/components/pages/TrajectoriesView.tsx`
- `packages/app-core/src/components/pages/TrajectoryDetailView.tsx`
- `packages/app-core/src/state/useDataLoaders.ts`
- `packages/app-core/src/state/useChatCallbacks.ts`
- `packages/app-core/src/api/server.ts`
- `convex/schema.ts`
- `convex/trajectories.ts`

## Live / Real Status

- real Convex deployment was exercised during this work
- trajectory create/list/detail/delete was smoke-tested against the live deployment
- immediate post-delete detail lookup returned `null`, so the current delete consistency behavior is acceptable for the tested path

Local sensitive config was not committed. In particular:

- `.env.local` is left untracked
- local machine/user config should still be handled outside git

## Validations Run

The following targeted validations passed during the later slices:

```bash
bunx vitest run packages/agent/src/runtime/convex.test.ts packages/shared/src/backend.test.ts packages/app-core/src/config/schema.test.ts packages/agent/src/runtime/trajectory-backend.test.ts
bunx vitest run --config vitest.e2e.config.ts packages/agent/test/database-api.e2e.test.ts packages/agent/test/api-auth.e2e.test.ts packages/agent/test/api-server.e2e.test.ts
bunx vitest run packages/app-core/test/app/trajectories-view.test.tsx packages/app-core/test/app/secrets-view.test.tsx packages/app-core/src/components/pages/TrajectoriesView.test.ts packages/app-core/src/runtime/eliza.test.ts
bunx vitest run packages/app-core/test/app/chat-journey.test.ts packages/app-core/test/app/chat-send-lock.test.ts
bunx vitest run packages/app-core/src/api/server.wallet-keys.test.ts packages/app-core/test/app/chat-journey.test.ts packages/app-core/test/app/chat-send-lock.test.ts
git diff --check
```

`git diff --check` still prints the pre-existing line-ending warning on `packages/agent/src/api/database.ts`, but no new diff-check errors were introduced.

## Known Limits

1. This is still coexistence mode.
- `legacy-sql` remains the compatibility path.
- Convex is only proven for the first vertical slice, centered on trajectories plus backend-aware status/config flows.

2. Conversations are only partially backend-migrated.
- list/delete/reset behavior is now backend-aware
- persisted conversation cleanup on non-SQL backends is reported as limited rather than falsely supported
- there is not yet a real Convex-backed conversation persistence implementation

3. The branch contains broad retargeted product work.
- this is not a tiny PR
- if upstreaming, split by slice rather than landing everything at once

## Best Next Steps

1. Decide whether the next vertical slice is:
- real Convex-backed conversation persistence
- another backend-owned surface outside chat, such as knowledge or memory browsing

2. If staying in chat:
- make create/rename/truncate semantics explicitly backend-aware where needed
- avoid any remaining silent assumptions that conversation persistence is SQL-backed

3. If preparing upstream PRs:
- split into bounded patches
- keep fork-only or local-only workflow changes out of product PRs

4. If continuing Convex migration:
- keep secrets in the standard Secrets / `env` path
- keep backend selection in `backend`
- do not reintroduce secret-bearing backend config

## Pickup Notes

- current worktree branch already contains the retargeted changes
- push this branch to the fork before further risky rebases or slicing
- if a new working branch is created from here, branch off `codex/backend-revamp-retarget` rather than old workflow-guardrails work
