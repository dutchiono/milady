import { describe, expect, it, vi } from "vitest";
import {
  callConvexFunction,
  getConvexTrajectoryFunctionPath,
  validateConvexConfig,
  validateConvexTrajectoryFunctions,
} from "./convex";

describe("convex trajectory config helpers", () => {
  it("reports missing trajectory functions", () => {
    expect(
      validateConvexTrajectoryFunctions({
        enabled: true,
        url: "https://example.convex.cloud",
        deployment: "dev:milady",
        adminKey: "secret",
        trajectory: {
          listTrajectories: "trajectories:list",
        },
      }),
    ).toContain("trajectory.getTrajectoryDetail");
  });

  it("returns configured trajectory function paths", () => {
    expect(
      getConvexTrajectoryFunctionPath(
        {
          trajectory: {
            getTrajectoryStats: "trajectories:stats",
          },
        },
        "getTrajectoryStats",
      ),
    ).toBe("trajectories:stats");
  });

  it("accepts CONVEX_ADMIN_KEY as a fallback secret source", () => {
    expect(
      validateConvexConfig(
        {
          enabled: true,
          url: "https://example.convex.cloud",
          deployment: "dev:milady",
        },
        { CONVEX_ADMIN_KEY: "secret" },
      ),
    ).toEqual([]);
  });

  it("preserves explicit null results from Convex functions", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "success", value: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    try {
      await expect(
        callConvexFunction<null>({
          convex: {
            enabled: true,
            url: "https://example.convex.cloud",
            deployment: "dev:milady",
            adminKey: "secret",
          },
          functionName: "trajectories:get",
          kind: "query",
        }),
      ).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
