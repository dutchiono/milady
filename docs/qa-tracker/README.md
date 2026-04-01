# Milady QA Tracker

This folder contains the static GitHub Pages QA tracker for connectors, plugins, promo videos, and tutorials.

## Publish path

- Page: `qa-tracker/index.html`
- Shared state: `qa-tracker/state.json`

The repository workflow copies these files into the Pages output and preserves the current `state.json` from `gh-pages` so normal homepage deploys do not erase live QA assignments.

## Sign-in modes

- PAT fallback: paste a GitHub token with `repo` scope into the page.
- OAuth: deploy `oauth-worker.js` as a Cloudflare Worker and set:
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`

Then update `OAUTH_CONFIG` in [`index.html`](./index.html) with the GitHub OAuth app client id and the Worker URL.

## GitHub OAuth app

Create a GitHub OAuth app with:

- Homepage URL: your published QA tracker URL
- Authorization callback URL: the same QA tracker URL

The worker only exchanges the GitHub auth code for an access token. The browser still talks directly to the GitHub API after sign-in.
