# Repo write gate

Before any repo mutation, confirm that the user has explicitly authorized a write.

## Writes covered by this gate

- branch creation
- file creation
- file edits
- commits
- pushes
- pull requests
- comment edits
- labels or reactions used as workflow control

## Safe default

If the user asks to:

- investigate
- analyze
- compare
- understand
- help think
- make docs
- audit the repo
- figure out the task

then the task is read-only unless the user separately requests a write.

## Why this gate exists

Repo writes can trigger:

- CI jobs
- review workflows
- bot comments
- emails
- mobile notifications

These side effects happen even when the written artifact is later reverted.

## Required pre-write checklist

Before writing to the repo, verify:

1. the user explicitly asked for a write
2. the target branch is known
3. the artifact is worth triggering CI for
4. the patch is not a temporary note or a thought-capture artifact
5. the write is the smallest valid artifact
