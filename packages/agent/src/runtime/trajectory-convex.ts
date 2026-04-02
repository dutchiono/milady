import type { IAgentRuntime } from "@elizaos/core";
import { loadElizaConfig } from "../config/config";
import type {
  Trajectory,
  TrajectoryListItem,
  TrajectoryListOptions,
  TrajectoryListResult,
  TrajectoryStatus,
} from "../types/trajectory";
import {
  callConvexFunction,
  getConfiguredConvexConfig,
  getConvexTrajectoryFunctionPath,
  validateConvexConfig,
  validateConvexTrajectoryFunctions,
} from "./convex";
import {
  asRecord,
  normalizeStatus,
  toNumber,
  toOptionalNumber,
  toText,
} from "./trajectory-internals";

function getConvexTrajectoryConfig() {
  const convex = getConfiguredConvexConfig(loadElizaConfig().backend);
  if (!convex) {
    throw new Error("Convex backend is not configured.");
  }

  const missing = [
    ...validateConvexConfig(convex),
    ...validateConvexTrajectoryFunctions(convex),
  ];
  if (missing.length > 0) {
    throw new Error(
      `Convex trajectory persistence is missing: ${missing.join(", ")}`,
    );
  }

  return convex;
}

function requireTrajectoryFunctionPath(
  name:
    | "listTrajectories"
    | "getTrajectoryDetail"
    | "getTrajectoryStats"
    | "startTrajectory"
    | "completeTrajectory"
    | "appendLlmCall"
    | "appendProviderAccess"
    | "deleteTrajectories"
    | "clearAllTrajectories",
): string {
  const convex = getConvexTrajectoryConfig();
  const path = getConvexTrajectoryFunctionPath(convex, name);
  if (!path) {
    throw new Error(`Convex trajectory function "${name}" is not configured.`);
  }
  return path;
}

export function isConvexTrajectoryPersistenceConfigured(): boolean {
  try {
    getConvexTrajectoryConfig();
    return true;
  } catch {
    return false;
  }
}

function normalizeTrajectoryListItem(
  runtime: IAgentRuntime,
  value: unknown,
): TrajectoryListItem | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    id: toText(record.id ?? record.trajectoryId, ""),
    agentId: toText(record.agentId, runtime.agentId),
    source: toText(record.source, "runtime"),
    status: normalizeStatus(record.status, "completed"),
    startTime: toNumber(record.startTime, Date.now()),
    endTime: toOptionalNumber(record.endTime) ?? null,
    durationMs: toOptionalNumber(record.durationMs) ?? null,
    stepCount: toOptionalNumber(record.stepCount),
    llmCallCount: toNumber(record.llmCallCount, 0),
    providerAccessCount: toOptionalNumber(record.providerAccessCount) ?? 0,
    totalPromptTokens: toNumber(record.totalPromptTokens, 0),
    totalCompletionTokens: toNumber(record.totalCompletionTokens, 0),
    createdAt: toText(
      record.createdAt,
      new Date(toNumber(record.startTime, Date.now())).toISOString(),
    ),
    metadata: asRecord(record.metadata) ?? {},
  };
}

function normalizeTrajectoryDetail(
  runtime: IAgentRuntime,
  trajectoryId: string,
  value: unknown,
): Trajectory | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    trajectoryId: toText(record.trajectoryId ?? record.id, trajectoryId),
    agentId: toText(record.agentId, runtime.agentId),
    startTime: toNumber(record.startTime, Date.now()),
    endTime: toOptionalNumber(record.endTime),
    durationMs: toOptionalNumber(record.durationMs),
    steps: Array.isArray(record.steps)
      ? (record.steps as Trajectory["steps"])
      : undefined,
    metrics: asRecord(record.metrics) as Trajectory["metrics"],
    metadata: asRecord(record.metadata) ?? {},
    stepsJson:
      typeof record.stepsJson === "string" ? record.stepsJson : undefined,
  };
}

export async function listConvexTrajectories(
  runtime: IAgentRuntime,
  options: TrajectoryListOptions = {},
): Promise<TrajectoryListResult> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("listTrajectories");
  const result = await callConvexFunction<unknown>({
    convex,
    functionName,
    kind: "query",
    args: {
      ...options,
      agentId: runtime.agentId,
    },
  });

  const record = asRecord(result);
  const limit = Math.min(500, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const trajectories = Array.isArray(record?.trajectories)
    ? record.trajectories
        .map((item) => normalizeTrajectoryListItem(runtime, item))
        .filter((item): item is TrajectoryListItem => Boolean(item))
    : [];

  return {
    trajectories,
    total: toNumber(record?.total, trajectories.length),
    offset: toNumber(record?.offset, offset),
    limit: toNumber(record?.limit, limit),
  };
}

export async function getConvexTrajectoryDetail(
  runtime: IAgentRuntime,
  trajectoryId: string,
): Promise<Trajectory | null> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("getTrajectoryDetail");
  const result = await callConvexFunction<unknown>({
    convex,
    functionName,
    kind: "query",
    args: {
      trajectoryId,
      agentId: runtime.agentId,
    },
  });

  return normalizeTrajectoryDetail(runtime, trajectoryId, result);
}

export async function getConvexTrajectoryStats(
  runtime: IAgentRuntime,
): Promise<unknown> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("getTrajectoryStats");
  return callConvexFunction({
    convex,
    functionName,
    kind: "query",
    args: { agentId: runtime.agentId },
  });
}

export async function startConvexTrajectory(
  runtime: IAgentRuntime,
  params: {
    stepId: string;
    source?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("startTrajectory");
  await callConvexFunction({
    convex,
    functionName,
    kind: "mutation",
    args: {
      agentId: runtime.agentId,
      stepId: params.stepId,
      source: params.source,
      metadata: params.metadata,
      timestamp: Date.now(),
    },
  });
}

export async function completeConvexTrajectory(
  runtime: IAgentRuntime,
  params: {
    stepId: string;
    status: TrajectoryStatus;
    source?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("completeTrajectory");
  await callConvexFunction({
    convex,
    functionName,
    kind: "mutation",
    args: {
      agentId: runtime.agentId,
      stepId: params.stepId,
      status: params.status,
      source: params.source,
      metadata: params.metadata,
      timestamp: Date.now(),
    },
  });
}

export async function appendConvexTrajectoryLlmCall(
  runtime: IAgentRuntime,
  stepId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("appendLlmCall");
  await callConvexFunction({
    convex,
    functionName,
    kind: "mutation",
    args: {
      agentId: runtime.agentId,
      stepId,
      payload,
    },
  });
}

export async function appendConvexTrajectoryProviderAccess(
  runtime: IAgentRuntime,
  stepId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("appendProviderAccess");
  await callConvexFunction({
    convex,
    functionName,
    kind: "mutation",
    args: {
      agentId: runtime.agentId,
      stepId,
      payload,
    },
  });
}

export async function deleteConvexTrajectories(
  runtime: IAgentRuntime,
  trajectoryIds: string[],
): Promise<number> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("deleteTrajectories");
  const result = await callConvexFunction<unknown>({
    convex,
    functionName,
    kind: "mutation",
    args: {
      agentId: runtime.agentId,
      trajectoryIds,
    },
  });
  const record = asRecord(result);
  return toNumber(record?.deleted, 0);
}

export async function clearAllConvexTrajectories(
  runtime: IAgentRuntime,
): Promise<number> {
  const convex = getConvexTrajectoryConfig();
  const functionName = requireTrajectoryFunctionPath("clearAllTrajectories");
  const result = await callConvexFunction<unknown>({
    convex,
    functionName,
    kind: "mutation",
    args: {
      agentId: runtime.agentId,
    },
  });
  const record = asRecord(result);
  return toNumber(record?.deleted, 0);
}
