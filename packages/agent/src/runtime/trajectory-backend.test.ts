import { afterEach, describe, expect, it } from "vitest";
import {
  createDatabaseTrajectoryLogger,
  loadPersistedTrajectoryRows,
} from "./trajectory-persistence";

const originalActiveBackend = process.env.MILADY_ACTIVE_BACKEND;

afterEach(() => {
  if (originalActiveBackend === undefined) {
    delete process.env.MILADY_ACTIVE_BACKEND;
    return;
  }
  process.env.MILADY_ACTIVE_BACKEND = originalActiveBackend;
});

describe("trajectory backend compatibility", () => {
  it("returns an empty result set when the active backend is convex", async () => {
    process.env.MILADY_ACTIVE_BACKEND = "convex";

    const rows = await loadPersistedTrajectoryRows({ agentId: "agent-1" } as never);

    expect(rows).toEqual([]);
  });

  it("keeps the route-compatible trajectory logger empty under convex", async () => {
    process.env.MILADY_ACTIVE_BACKEND = "convex";

    const logger = createDatabaseTrajectoryLogger({ agentId: "agent-1" } as never);

    await expect(logger.listTrajectories({})).resolves.toEqual({
      trajectories: [],
      total: 0,
      offset: 0,
      limit: 50,
    });
    await expect(logger.getTrajectoryDetail("traj-1")).resolves.toBeNull();
    await expect(logger.getStats()).resolves.toEqual({
      total: 0,
      byStatus: {},
      bySource: {},
    });
  });
});
