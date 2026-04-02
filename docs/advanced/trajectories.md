---
title: Trajectories
sidebarTitle: Trajectories
description: View and analyze LLM call history for your Milady agent — inspect prompts, responses, token usage, and latency.
---

The Trajectories tab provides a detailed viewer for your agent's LLM call history. Every call the agent makes to a language model is recorded as a trajectory, giving you full visibility into prompts, responses, token usage, and performance.

## Overview

Access Trajectories from the **Advanced** section of the dashboard at `/trajectories`. The viewer displays a reverse-chronological list of all LLM interactions.

## What's Recorded

Each trajectory entry captures:

| Field | Description |
|-------|-------------|
| **Timestamp** | When the LLM call was made |
| **Model** | Which model was used (e.g., GPT-4o, Claude 3.5 Sonnet) |
| **Prompt** | The full prompt sent to the model, including system message and conversation history |
| **Response** | The model's complete response |
| **Token usage** | Input tokens, output tokens, and total |
| **Latency** | Time taken for the call to complete |
| **Status** | Success or error state |

## Using the Viewer

The trajectory list shows a summary card for each call. Click any entry to open the detail view, which displays the full prompt and response in a readable format.

### Filtering

Filter trajectories by:

- **Model** — narrow down to calls made to a specific model
- **Time range** — view calls from a specific period
- **Status** — filter by success or error

### Detail View

The detail view for an individual trajectory shows:

- Full prompt with system message, conversation history, and any tool calls
- Complete model response
- Token breakdown (input/output/total)
- Latency and timing information
- Error details if the call failed

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trajectories` | List trajectory entries |
| GET | `/api/trajectories/:id` | Get a specific trajectory detail |

See the [REST API Reference](/rest/trajectories) for full endpoint documentation.

## Convex Backend Contract

When Milady runs with `backend.kind: "convex"`, trajectory persistence is provided by explicit Convex HTTP function paths under `backend.convex.trajectory`.

Keep only non-secret Convex settings in `backend.convex`. Store `CONVEX_ADMIN_KEY` in Secrets or the `env` block so the runtime can hydrate it into `process.env` using the standard elizaOS secret flow.

Required functions:

- `listTrajectories`
- `getTrajectoryDetail`
- `getTrajectoryStats`
- `startTrajectory`
- `completeTrajectory`
- `appendLlmCall`
- `appendProviderAccess`
- `deleteTrajectories`
- `clearAllTrajectories`

Milady calls `listTrajectories`, `getTrajectoryDetail`, and `getTrajectoryStats` as Convex queries. The remaining functions are called as Convex mutations.

Expected argument shape:

```json
{
  "agentId": "agent-123",
  "...": "function-specific fields"
}
```

For write operations Milady also sends `stepId`, normalized payload fields, and a millisecond `timestamp` where relevant. Query functions should return the same logical shapes the app already expects from the legacy SQL path:

- list: `{ trajectories, total, offset, limit }`
- detail: one trajectory with `trajectoryId`, `agentId`, `startTime`, optional `endTime`, `steps`, `metrics`, and `metadata`
- stats: aggregate counts object

If these function paths are missing, Milady keeps trajectory persistence unavailable on the active Convex backend and the UI will render an explicit unsupported state.
