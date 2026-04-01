# Revamp execution checklist

Use this checklist before starting a large repo overhaul.

## Phase 1 — Read-only audit

- identify current runtime architecture
- identify current data and storage surfaces
- identify current app surfaces (`apps/app`, `apps/homepage`, shared UI)
- identify current CI, release, and workflow surfaces
- identify direct mismatches with the new requirements

## Phase 2 — Decision capture

Do not implement until the following are explicit:

- target app surface
- target backend/storage model
- which existing systems are being replaced
- which existing workflows remain in force
- what must ship first

## Phase 3 — Smallest valid write

When writing begins:

- create one branch for one bounded workstream
- keep docs, workflow changes, and implementation separate where possible
- do not mix CI triage with architecture rewrite in the same patch
- do not open a PR until the user wants a PR

## Phase 4 — Validation

For each patch:

- run only the relevant validation first
- capture exact failing or passing commands
- distinguish code failure from workflow failure
- distinguish service outage from patch breakage

## Phase 5 — Delivery

Only after the patch is real and reviewed by the user should it be:

- committed
- pushed
- turned into a PR
