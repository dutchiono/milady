# Revamp repo audit

This audit captures the current Milady repo surfaces that matter for a large architecture revamp.

## Current backend and storage signals

- root `package.json` includes `drizzle-orm`
- root `package.json` includes `pg`
- root `package.json` includes `ws`
- `docs/architecture.mdx` documents raw Node HTTP + WebSocket plus PGLite/PostgreSQL
- `packages/app-core/src/utils/sql-compat.ts` still imports `drizzle-orm` and applies SQL compatibility repair logic

## Current app surfaces

- `apps/app` is the main React + Vite + Tailwind application surface
- `apps/homepage` already exists and is the most natural landing-page surface
- `packages/ui` is the shared internal UI package

## Current workflow and delivery surfaces

- `.github/workflows/test.yml` already defines broad CI coverage
- `.github/workflows/release-electrobun.yml` already defines multi-platform release packaging
- workflow and release work should therefore extend or replace existing machinery rather than start from zero

## Immediate conclusion

A revamp that removes Drizzle/Postgres-era assumptions and introduces a new backend model is a real architecture migration against an already established repo. Work should start with bounded workflow and planning artifacts, then move to implementation in small patches.
