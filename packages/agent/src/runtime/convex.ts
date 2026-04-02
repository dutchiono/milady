import type {
  BackendConfig,
  BackendConvexConfig,
} from "../config/types.eliza";

export type ConvexFunctionKind = "query" | "mutation";

export type ConvexTrajectoryFunctionName =
  | "listTrajectories"
  | "getTrajectoryDetail"
  | "getTrajectoryStats"
  | "startTrajectory"
  | "completeTrajectory"
  | "appendLlmCall"
  | "appendProviderAccess"
  | "deleteTrajectories"
  | "clearAllTrajectories";

const REQUIRED_CONVEX_TRAJECTORY_FUNCTIONS: ConvexTrajectoryFunctionName[] = [
  "listTrajectories",
  "getTrajectoryDetail",
  "getTrajectoryStats",
  "startTrajectory",
  "completeTrajectory",
  "appendLlmCall",
  "appendProviderAccess",
  "deleteTrajectories",
  "clearAllTrajectories",
];

function resolveConvexAdminKey(
  convex: BackendConvexConfig | undefined,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const configValue = convex?.adminKey?.trim();
  if (configValue) return configValue;
  const envValue = env.CONVEX_ADMIN_KEY?.trim();
  return envValue || null;
}

export function getConfiguredConvexConfig(
  backend: BackendConfig | undefined,
): BackendConvexConfig | undefined {
  return backend?.kind === "convex" ? backend.convex : undefined;
}

export function formatConvexServerVersion(params: {
  deployment: string;
  httpStatus?: number;
}): string {
  return params.httpStatus === undefined
    ? `convex:${params.deployment}`
    : `convex:${params.deployment} (HTTP ${params.httpStatus})`;
}

export function validateConvexConfig(
  convex: BackendConvexConfig | undefined,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const missing: string[] = [];
  if (convex?.enabled !== true) missing.push("enabled");
  if (!convex?.url?.trim()) missing.push("url");
  if (!convex?.deployment?.trim()) missing.push("deployment");
  if (!resolveConvexAdminKey(convex, env)) missing.push("adminKey");
  return missing;
}

export function validateConvexTrajectoryFunctions(
  convex: BackendConvexConfig | undefined,
): string[] {
  const trajectory = convex?.trajectory;
  if (!trajectory) {
    return REQUIRED_CONVEX_TRAJECTORY_FUNCTIONS.map(
      (name) => `trajectory.${name}`,
    );
  }

  return REQUIRED_CONVEX_TRAJECTORY_FUNCTIONS.filter(
    (name) => !trajectory[name]?.trim(),
  ).map((name) => `trajectory.${name}`);
}

export function getConvexTrajectoryFunctionPath(
  convex: BackendConvexConfig | undefined,
  name: ConvexTrajectoryFunctionName,
): string | null {
  const path = convex?.trajectory?.[name]?.trim();
  return path || null;
}

export async function callConvexFunction<T>(params: {
  convex: BackendConvexConfig;
  functionName: string;
  kind: ConvexFunctionKind;
  args?: Record<string, unknown>;
}): Promise<T> {
  const url = params.convex.url?.trim();
  if (!url) {
    throw new Error("Convex backend requires url.");
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const adminKey = resolveConvexAdminKey(params.convex);
  if (adminKey) {
    headers.authorization = `Convex ${adminKey}`;
  }

  const response = await fetch(`${url}/api/${params.kind}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      path: params.functionName,
      args: params.args ?? {},
    }),
    signal: AbortSignal.timeout(5000),
  });

  const payload = (await response.json().catch(() => null)) as
    | { status?: string; value?: T; errorMessage?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.errorMessage ??
        `Convex ${params.kind} failed with HTTP ${response.status}`,
    );
  }

  if (payload?.status === "error") {
    throw new Error(payload.errorMessage ?? "Convex function failed");
  }

  if (payload && "value" in payload) {
    return payload.value as T;
  }

  return payload as T;
}

export async function probeConvexBackend(
  convex: BackendConvexConfig,
): Promise<{
  httpStatus: number;
  serverVersion: string;
}> {
  const url = convex.url?.trim();
  const deployment = convex.deployment?.trim();
  if (!url || !deployment) {
    throw new Error("Convex backend requires url and deployment.");
  }

  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });

  return {
    httpStatus: response.status,
    serverVersion: formatConvexServerVersion({
      deployment,
      httpStatus: response.status,
    }),
  };
}
