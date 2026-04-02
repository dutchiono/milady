import { describe, expect, it } from "vitest";
import {
  buildBackendRuntimeStatus,
  detectActiveBackend,
  getConvexActivationStatus,
  normalizeBackendConfig,
  resolveConfiguredBackendKind,
  resolveRequestedActiveBackend,
} from "./backend";

describe("backend helpers", () => {
  it("defaults backend config to legacy-sql", () => {
    expect(resolveConfiguredBackendKind(undefined)).toBe("legacy-sql");
    expect(normalizeBackendConfig(undefined)).toEqual({ kind: "legacy-sql" });
  });

  it("detects active backend from environment", () => {
    expect(detectActiveBackend({ MILADY_ACTIVE_BACKEND: "convex" })).toBe(
      "convex",
    );
    expect(detectActiveBackend({ MILADY_ACTIVE_BACKEND: "legacy-sql" })).toBe(
      "legacy-sql",
    );
    expect(detectActiveBackend({})).toBe("legacy-sql");
  });

  it("builds migration-aware backend status", () => {
    expect(
      buildBackendRuntimeStatus({
        backend: {
          kind: "convex",
          convex: {
            enabled: true,
            url: "https://example.convex.cloud",
            deployment: "dev:milady",
            adminKey: "secret",
          },
        },
        env: { MILADY_ACTIVE_BACKEND: "legacy-sql" },
        legacyProvider: "pglite",
      }),
    ).toEqual({
      configured: "convex",
      active: "legacy-sql",
      needsMigration: true,
      legacyProvider: "pglite",
      capabilities: {
        databaseBrowser: true,
        sqlQuery: true,
        trajectoryPersistence: true,
      },
      convex: {
        enabled: true,
        url: "https://example.convex.cloud",
        deployment: "dev:milady",
        hasAdminKey: true,
        runtimeFlagEnabled: false,
        canActivate: false,
        missing: [],
      },
    });
  });

  it("marks SQL-only capabilities unavailable on active convex backends", () => {
    expect(
      buildBackendRuntimeStatus({
        backend: {
          kind: "convex",
          convex: { enabled: true },
        },
        env: { MILADY_ACTIVE_BACKEND: "convex" },
        legacyProvider: "postgres",
      }).capabilities,
    ).toEqual({
      databaseBrowser: false,
      sqlQuery: false,
      trajectoryPersistence: false,
    });
  });

  it("reports convex activation blockers until the runtime flag is enabled", () => {
    expect(
      getConvexActivationStatus({
        backend: {
          kind: "convex",
          convex: {
            enabled: true,
            url: "https://example.convex.cloud",
            deployment: "dev:milady",
            adminKey: "secret",
          },
        },
        env: {},
      }),
    ).toEqual({
      enabled: true,
      url: "https://example.convex.cloud",
      deployment: "dev:milady",
      hasAdminKey: true,
      runtimeFlagEnabled: false,
      canActivate: false,
      missing: [],
    });
  });

  it("activates convex only when config is complete and the runtime flag is enabled", () => {
    expect(
      resolveRequestedActiveBackend(
        {
          kind: "convex",
          convex: {
            enabled: true,
            url: "https://example.convex.cloud",
            deployment: "dev:milady",
            adminKey: "secret",
          },
        },
        { MILADY_ENABLE_EXPERIMENTAL_CONVEX_RUNTIME: "1" },
      ),
    ).toBe("convex");
  });

  it("accepts a convex admin key from environment fallback", () => {
    expect(
      getConvexActivationStatus({
        backend: {
          kind: "convex",
          convex: {
            enabled: true,
            url: "https://example.convex.cloud",
            deployment: "dev:milady",
          },
        },
        env: {
          CONVEX_ADMIN_KEY: "secret",
          MILADY_ENABLE_EXPERIMENTAL_CONVEX_RUNTIME: "1",
        },
      }),
    ).toEqual({
      enabled: true,
      url: "https://example.convex.cloud",
      deployment: "dev:milady",
      hasAdminKey: true,
      runtimeFlagEnabled: true,
      canActivate: true,
      missing: [],
    });
  });

  it("marks trajectory persistence available on active convex when function paths are configured", () => {
    expect(
      buildBackendRuntimeStatus({
        backend: {
          kind: "convex",
          convex: {
            enabled: true,
            url: "https://example.convex.cloud",
            deployment: "dev:milady",
            adminKey: "secret",
            trajectory: {
              listTrajectories: "trajectories:list",
              getTrajectoryDetail: "trajectories:get",
              getTrajectoryStats: "trajectories:stats",
              startTrajectory: "trajectories:start",
              completeTrajectory: "trajectories:complete",
              appendLlmCall: "trajectories:appendLlmCall",
              appendProviderAccess: "trajectories:appendProviderAccess",
              deleteTrajectories: "trajectories:delete",
              clearAllTrajectories: "trajectories:clearAll",
            },
          },
        },
        env: { MILADY_ACTIVE_BACKEND: "convex" },
        legacyProvider: "pglite",
      }).capabilities.trajectoryPersistence,
    ).toBe(true);
  });
});
