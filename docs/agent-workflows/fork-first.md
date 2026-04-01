# Fork-first workflow

This repo uses a fork-first workflow with `dutchiono/milady` as the working repository.

## Working rules

- do all work in `dutchiono/milady`
- base new work on `develop`
- use `codex/<task-name>` branches
- validate in the fork first
- do not assume validation requires opening a PR immediately

## What fork-first means

Fork-first means the fork is the working and validation arena.

It does not mean:

- PR-first
- bot-first
- notify-the-user-first

## Validation packet

A branch or patch becomes a validation packet only after the user explicitly asks for repo writes.

That packet should contain:

- a narrow patch
- exact validation steps run
- known limitations
- a clean summary of what changed

## No draft churn

Do not create branches, commits, or PRs just to hold thinking artifacts.

Use read-only analysis first, then write only the approved artifact.
