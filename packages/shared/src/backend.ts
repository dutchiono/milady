import type {
  BackendConfig,
  BackendKind,
  DatabaseProviderType,
} from "./contracts/config.js";

const REQUIRED_CONVEX_TRAJECTORY_FUNCTIONS = [
  "listTrajectories",
  "getTrajectoryDetail",
  "getTrajectoryStats",
  "startTrajectory",
  "completeTrajectory",
  "appendLlmCall",
  "appendProviderAccess",
  "deleteTrajectories",
  "clearAllTrajectories",
] as const;

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}

function resolveConvexAdminKey(
  backend: BackendConfig | undefined,
  env: Record<string, string | undefined>,
): string | null {
  const configValue = backend?.convex?.adminKey?.trim();
  if (configValue) return configValue;
  const envValue = env.CONVEX_ADMIN_KEY?.trim();
  return envValue || null;
}

function hasConvexTrajectoryPersistenceConfig(
  backend: BackendConfig | undefined,
): boolean {
  const trajectory = backend?.convex?.trajectory;
  if (!trajectory) return false;
  return REQUIRED_CONVEX_TRAJECTORY_FUNCTIONS.every((key) =>
    Boolean(trajectory[key]?.trim()),
  );
}

export interface BackendConvexActivationStatus {
  enabled: boolean;
  url: string | null;
  deployment: string | null;
  hasAdminKey: boolean;
  runtimeFlagEnabled: boolean;
  canActivate: boolean;
  missing: string[];
}

export interface BackendRuntimeStatus {
  configured: BackendKind;
  active: BackendKind;
  needsMigration: boolean;
  legacyProvider: DatabaseProviderType;
  capabilities: {
    databaseBrowser: boolean;
    sqlQuery: boolean;
    trajectoryPersistence: boolean;
  };
  convex: BackendConvexActivationStatus;
}

export function resolveConfiguredBackendKind(
  backend: BackendConfig | undefined,
): BackendKind {
  return backend?.kind ?? "legacy-sql";
}

export function normalizeBackendConfig(
  backend: BackendConfig | undefined,
): BackendConfig {
  return {
    kind: resolveConfiguredBackendKind(backend),
    ...(backend ?? {}),
  };
}

export function detectActiveBackend(
  env: Record<string, string | undefined>,
): BackendKind {
  const active = env.MILADY_ACTIVE_BACKEND?.trim();
  return active === "convex" ? "convex" : "legacy-sql";
}

export function getConvexActivationStatus(params: {
  backend: BackendConfig | undefined;
  env: Record<string, string | undefined>;
}): BackendConvexActivationStatus {
  const convex = params.backend?.convex;
  const missing: string[] = [];
  const enabled = convex?.enabled === true;
  const url = convex?.url?.trim() || null;
  const deployment = convex?.deployment?.trim() || null;
  const hasAdminKey = Boolean(resolveConvexAdminKey(params.backend, params.env));
  const runtimeFlagEnabled = isTruthyEnv(
    params.env.MILADY_ENABLE_EXPERIMENTAL_CONVEX_RUNTIME,
  );

  if (!enabled) missing.push("enabled");
  if (!url) missing.push("url");
  if (!deployment) missing.push("deployment");
  if (!hasAdminKey) missing.push("adminKey");

  return {
    enabled,
    url,
    deployment,
    hasAdminKey,
    runtimeFlagEnabled,
    canActivate: runtimeFlagEnabled && missing.length === 0,
    missing,
  };
}

export function resolveRequestedActiveBackend(
  backend: BackendConfig | undefined,
  env: Record<string, string | undefined>,
): BackendKind {
  if (resolveConfiguredBackendKind(backend) !== "convex") return "legacy-sql";
  return getConvexActivationStatus({ backend, env }).canActivate
    ? "convex"
    : "legacy-sql";
}

export function buildBackendRuntimeStatus(params: {
  backend: BackendConfig | undefined;
  env: Record<string, string | undefined>;
  legacyProvider: DatabaseProviderType;
}): BackendRuntimeStatus {
  const configured = resolveConfiguredBackendKind(params.backend);
  const active = params.env.MILADY_ACTIVE_BACKEND?.trim()
    ? detectActiveBackend(params.env)
    : resolveRequestedActiveBackend(params.backend, params.env);
  const convex = getConvexActivationStatus(params);
  const isLegacySql = active === "legacy-sql";

  return {
    configured,
    active,
    needsMigration: configured !== active,
    legacyProvider: params.legacyProvider,
    capabilities: {
      databaseBrowser: isLegacySql,
      sqlQuery: isLegacySql,
      trajectoryPersistence:
        isLegacySql ||
        (active === "convex" &&
          convex.canActivate &&
          hasConvexTrajectoryPersistenceConfig(params.backend)),
    },
    convex: {
      enabled: convex.enabled,
      url: convex.url,
      deployment: convex.deployment,
      hasAdminKey: convex.hasAdminKey,
      runtimeFlagEnabled: convex.runtimeFlagEnabled,
      canActivate: convex.canActivate,
      missing: convex.missing,
    },
  };
}
