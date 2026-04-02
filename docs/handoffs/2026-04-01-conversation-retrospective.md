# Conversation retrospective — 2026-04-01

## Why this file exists

This file documents the actual flow of the conversation that produced this branch so that future work can understand both the technical context and the workflow failures that occurred.

## Timeline summary

### 1. New handoff arrives

A new architecture and milestone handoff was introduced with explicit stack changes and expanded operational scope.

Key requested changes included:

- remove Clerk
- remove Drizzle
- remove PostgreSQL
- add Convex
- support a landing page / design system track
- include operational work such as CI/CD, production infrastructure, E2E validation, dependency patching, webhook reliability, service monitoring, and frontend error tracking

### 2. Initial interpretation drifted into speculation

Early responses over-indexed on hypothetical architecture discussion instead of staying tightly grounded in the actual Milady repo.

This was not useful enough for the user’s stated goal.

### 3. Repo investigation began

The repo was inspected and several real facts were established:

- current repo still carries Drizzle/Postgres-era signals
- current docs still describe raw Node HTTP + WebSocket and PGLite/PostgreSQL
- `apps/homepage` already exists as a landing-page candidate
- substantial CI/release infrastructure already exists

### 4. Wrong move: accidental PR-oriented behavior

Instead of staying read-only, workflow drifted into branch/file/PR behavior that the user did not want.

That caused:

- unwanted PR activity
- review workflow side effects
- bot comments
- user frustration

### 5. Cleanup occurred but side effects remained

The branch/PR diff state was cleaned up, but triggered workflows still generated comments and notifications.

This exposed the need for explicit workflow guardrails around analysis work.

### 6. Course correction

Work was redirected toward:

- documenting workflow guardrails
- documenting the repo audit
- documenting the conversation itself
- providing a clean handoff for continuing the overhaul

## Key lessons captured from the conversation

### Lesson 1 — analysis must be read-only by default

Investigation, requirements digestion, and draft docs must not mutate repo state unless explicitly instructed.

### Lesson 2 — PRs are not thinking artifacts

A PR should never be used to hold planning notes or analysis drafts.

### Lesson 3 — cleanup is not enough if workflows already fired

Git cleanup does not undo email or bot side effects once workflows have been triggered.

### Lesson 4 — repo-grounded findings matter more than architecture theater

The useful work came from identifying what Milady actually is today and where the new handoff conflicts with it.

### Lesson 5 — the larger revamp is real

This is not a cosmetic update. It is a real repo overhaul that will require multiple files and multiple bounded workstreams.

## Concrete repo-grounded conclusions captured during the conversation

### Backend/storage reality

- current repo still includes Drizzle/Postgres-era dependencies and docs
- current runtime still includes SQL compatibility machinery
- current backend is still raw HTTP + WebSocket oriented

### App reality

- landing-page work likely belongs in `apps/homepage`
- application/runtime surface work likely belongs in `apps/app`
- shared component work likely belongs in `packages/ui`

### Ops reality

- CI already exists and is broad
- release infrastructure already exists and is broad
- requested milestone work must therefore be mapped to current workflows rather than imagined from scratch

## What this retrospective should prevent

Future work should not repeat the following:

- speculative architecture talk without repo grounding
- accidental GitHub writes during analysis
- accidental PR creation
- temporary commits or thought-capture artifacts in the repo
- mixing workflow hygiene, architecture migration, and CI triage into one undisciplined action stream

## Effective rule extracted from the conversation

The correct sequence for major overhaul work in this repo is:

1. inspect repo read-only
2. document current surfaces
3. map mismatches against new requirements
4. codify workflow guardrails
5. create bounded implementation tracks
6. write only explicitly approved artifacts
