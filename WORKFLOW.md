# Milady workflow guardrails

## Defaults

- Working repo: `dutchiono/milady`
- Base branch: `develop`
- Branch format: `codex/<task-name>`

## Read-only by default

For investigation, analysis, triage, requirements digestion, repo audits, and doc drafting:

- do not create branches
- do not commit
- do not push
- do not open pull requests
- do not create temporary repo files

## Write gate

GitHub writes are allowed only after an explicit instruction such as:

- commit this
- create the branch
- write this into the repo
- make the file
- push this
- open the PR

`make docs` does not authorize pushing docs.

## Pull requests

Never open a pull request to hold notes, analysis, drafts, or planning material.

PRs are only for approved patches.

## Side effects

Assume every repo write can trigger:

- CI
- bot review
- bot comments
- emails
- notification spam

Cleanup later will not undo those notifications.

## Task split

### Analysis

Output only:

- confirmed repo facts
- mismatches against requested work
- decisions required before implementation
- draft content

### Triage

Output only:

- failing job
- first real error
- exact failing surface
- smallest likely fix target

### Implementation

Only implementation tasks may mutate repo state, and only after explicit user approval.
