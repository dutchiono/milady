/**
 * Trajectory query — read operations.
 *
 * Handles listing, loading, searching, and filtering trajectories.
 */

import type { IAgentRuntime } from "@elizaos/core";
import {
  isConvexTrajectoryPersistenceConfigured,
  listConvexTrajectories,
} from "./trajectory-convex";

import {
  asRecord,
  ensureTrajectoriesTable,
  executeRawSql,
  extractRows,
  getTrajectoryPersistenceAvailability,
  hasRuntimeDb,
  toNumber,
} from "./trajectory-internals";

// ---------------------------------------------------------------------------
// Public read API
// ---------------------------------------------------------------------------

export async function loadPersistedTrajectoryRows(
  runtime: IAgentRuntime,
  maxRows = 5000,
): Promise<Record<string, unknown>[] | null> {
  const availability = getTrajectoryPersistenceAvailability();
  if (!availability.supported) {
    if (
      availability.activeBackend === "convex" &&
      isConvexTrajectoryPersistenceConfigured()
    ) {
      const result = await listConvexTrajectories(runtime, { limit: maxRows });
      return result.trajectories.map((trajectory) => ({
        id: trajectory.id,
        agentId: trajectory.agentId,
        source: trajectory.source,
        status: trajectory.status,
        startTime: trajectory.startTime,
        endTime: trajectory.endTime,
        durationMs: trajectory.durationMs,
        stepCount: trajectory.stepCount ?? 0,
        llmCallCount: trajectory.llmCallCount,
        providerAccessCount: trajectory.providerAccessCount ?? 0,
        totalPromptTokens: trajectory.totalPromptTokens,
        totalCompletionTokens: trajectory.totalCompletionTokens,
        createdAt: trajectory.createdAt,
        metadata: trajectory.metadata ?? {},
      }));
    }
    return [];
  }
  if (!hasRuntimeDb(runtime)) return null;
  const tableReady = await ensureTrajectoriesTable(runtime);
  if (!tableReady) return [];

  const safeLimit = Math.max(1, Math.min(10000, Math.trunc(maxRows)));
  try {
    const result = await executeRawSql(
      runtime,
      `SELECT * FROM trajectories ORDER BY created_at DESC LIMIT ${safeLimit}`,
    );
    const rows = extractRows(result);
    return rows
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => Boolean(row));
  } catch {
    return null;
  }
}
