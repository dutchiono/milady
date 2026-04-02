import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

type TrajectoryStatus = "active" | "completed" | "error" | "timeout";

type LlmCall = {
  callId?: string;
  timestamp?: number;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  response?: string;
  temperature?: number;
  maxTokens?: number;
  purpose?: string;
  actionType?: string;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
};

type ProviderAccess = {
  providerId?: string;
  providerName?: string;
  purpose?: string;
  data?: unknown;
  query?: unknown;
  timestamp?: number;
};

type Step = {
  stepId?: string;
  timestamp: number;
  llmCalls?: LlmCall[];
  providerAccesses?: ProviderAccess[];
};

type TrajectoryDoc = {
  _id: unknown;
  agentId: string;
  trajectoryId: string;
  source: string;
  status: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  stepCount: number;
  llmCallCount: number;
  providerAccessCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  steps: Step[];
};

function toStatus(value: string | undefined): TrajectoryStatus {
  if (
    value === "active" ||
    value === "completed" ||
    value === "error" ||
    value === "timeout"
  ) {
    return value;
  }
  return "completed";
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function ensureStep(steps: Step[], stepId: string, timestamp: number): Step[] {
  const existing = steps.find((step) => step.stepId === stepId);
  if (existing) return steps;
  return [
    ...steps,
    {
      stepId,
      timestamp,
      llmCalls: [],
      providerAccesses: [],
    },
  ];
}

function summarizeSteps(steps: Step[]) {
  let llmCallCount = 0;
  let providerAccessCount = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const step of steps) {
    for (const call of step.llmCalls ?? []) {
      llmCallCount += 1;
      totalPromptTokens += call.promptTokens ?? 0;
      totalCompletionTokens += call.completionTokens ?? 0;
    }
    providerAccessCount += (step.providerAccesses ?? []).length;
  }

  return {
    stepCount: steps.length,
    llmCallCount,
    providerAccessCount,
    totalPromptTokens,
    totalCompletionTokens,
  };
}

function trajectorySummary(doc: TrajectoryDoc) {
  return {
    id: doc.trajectoryId,
    agentId: doc.agentId,
    source: doc.source,
    status: toStatus(doc.status),
    startTime: doc.startTime,
    endTime: doc.endTime ?? null,
    durationMs: doc.durationMs ?? null,
    stepCount: doc.stepCount,
    llmCallCount: doc.llmCallCount,
    providerAccessCount: doc.providerAccessCount,
    totalPromptTokens: doc.totalPromptTokens,
    totalCompletionTokens: doc.totalCompletionTokens,
    createdAt: doc.createdAt,
    metadata: doc.metadata ?? {},
  };
}

async function getTrajectoryDoc(
  ctx: { db: { query: (table: string) => any } },
  agentId: string,
  trajectoryId: string,
): Promise<TrajectoryDoc | null> {
  const found = await ctx.db
    .query("trajectories")
    .withIndex("by_agent_trajectory", (q: any) =>
      q.eq("agentId", agentId).eq("trajectoryId", trajectoryId),
    )
    .unique();
  return (found as TrajectoryDoc | null) ?? null;
}

async function upsertTrajectoryDoc(
  ctx: { db: { insert: (table: string, value: Record<string, unknown>) => Promise<unknown>; patch: (id: unknown, value: Record<string, unknown>) => Promise<void> } },
  params: {
    existing: TrajectoryDoc | null;
    agentId: string;
    trajectoryId: string;
    source: string;
    status: TrajectoryStatus;
    metadata?: Record<string, unknown>;
    steps: Step[];
    startTime: number;
    endTime?: number;
    updatedAt: number;
  },
) {
  const summary = summarizeSteps(params.steps);
  const doc = {
    agentId: params.agentId,
    trajectoryId: params.trajectoryId,
    source: params.source,
    status: params.status,
    startTime: params.startTime,
    endTime: params.endTime,
    durationMs:
      params.endTime === undefined
        ? undefined
        : Math.max(0, params.endTime - params.startTime),
    stepCount: summary.stepCount,
    llmCallCount: summary.llmCallCount,
    providerAccessCount: summary.providerAccessCount,
    totalPromptTokens: summary.totalPromptTokens,
    totalCompletionTokens: summary.totalCompletionTokens,
    createdAt: params.existing?.createdAt ?? iso(params.startTime),
    updatedAt: iso(params.updatedAt),
    metadata: params.metadata ?? params.existing?.metadata ?? {},
    steps: params.steps,
  };

  if (params.existing) {
    await ctx.db.patch(params.existing._id, doc);
    return params.existing._id;
  }
  return ctx.db.insert("trajectories", doc);
}

export const list = queryGeneric({
  args: v.object({
    agentId: v.string(),
    limit: v.optional(v.float64()),
    offset: v.optional(v.float64()),
    source: v.optional(v.string()),
    status: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  }),
  returns: v.object({
    trajectories: v.array(v.any()),
    total: v.float64(),
    offset: v.float64(),
    limit: v.float64(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(500, Math.max(1, Math.trunc(args.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(args.offset ?? 0));
    const rows = (await ctx.db
      .query("trajectories")
      .withIndex("by_agent_created_at", (q) => q.eq("agentId", args.agentId))
      .collect()) as TrajectoryDoc[];

    const startMs = args.startDate ? Date.parse(args.startDate) : Number.NaN;
    const endMs = args.endDate ? Date.parse(args.endDate) : Number.NaN;

    const filtered = rows
      .filter((row) => !args.source || row.source === args.source)
      .filter((row) => !args.status || row.status === args.status)
      .filter((row) => !Number.isFinite(startMs) || row.startTime >= startMs)
      .filter((row) => !Number.isFinite(endMs) || row.startTime <= endMs)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return {
      trajectories: filtered.slice(offset, offset + limit).map(trajectorySummary),
      total: filtered.length,
      offset,
      limit,
    };
  },
});

export const get = queryGeneric({
  args: v.object({
    agentId: v.string(),
    trajectoryId: v.string(),
  }),
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const doc = await getTrajectoryDoc(ctx, args.agentId, args.trajectoryId);
    if (!doc) return null;
    return {
      trajectoryId: doc.trajectoryId,
      agentId: doc.agentId,
      startTime: doc.startTime,
      endTime: doc.endTime,
      durationMs: doc.durationMs,
      steps: doc.steps,
      metrics: { finalStatus: toStatus(doc.status) },
      metadata: doc.metadata ?? {},
      stepsJson: JSON.stringify(doc.steps),
    };
  },
});

export const stats = queryGeneric({
  args: v.object({
    agentId: v.string(),
  }),
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query("trajectories")
      .withIndex("by_agent_created_at", (q) => q.eq("agentId", args.agentId))
      .collect()) as TrajectoryDoc[];

    const bySource: Record<string, number> = {};
    let totalLlmCalls = 0;
    let totalProviderAccesses = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalDurationMs = 0;
    let completedCount = 0;

    for (const row of rows) {
      bySource[row.source] = (bySource[row.source] ?? 0) + 1;
      totalLlmCalls += row.llmCallCount;
      totalProviderAccesses += row.providerAccessCount;
      totalPromptTokens += row.totalPromptTokens;
      totalCompletionTokens += row.totalCompletionTokens;
      if (typeof row.durationMs === "number") {
        totalDurationMs += row.durationMs;
        completedCount += 1;
      }
    }

    return {
      totalTrajectories: rows.length,
      totalLlmCalls,
      totalProviderAccesses,
      totalPromptTokens,
      totalCompletionTokens,
      averageDurationMs:
        completedCount === 0 ? 0 : Math.round(totalDurationMs / completedCount),
      bySource,
      byModel: {},
    };
  },
});

export const start = mutationGeneric({
  args: v.object({
    agentId: v.string(),
    stepId: v.string(),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
    timestamp: v.float64(),
  }),
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await getTrajectoryDoc(ctx, args.agentId, args.stepId);
    const steps = ensureStep(existing?.steps ?? [], args.stepId, args.timestamp);
    await upsertTrajectoryDoc(ctx, {
      existing,
      agentId: args.agentId,
      trajectoryId: args.stepId,
      source: args.source ?? existing?.source ?? "chat",
      status: "active",
      metadata: (args.metadata as Record<string, unknown> | undefined) ?? existing?.metadata,
      steps,
      startTime: existing?.startTime ?? args.timestamp,
      endTime: undefined,
      updatedAt: args.timestamp,
    });
    return null;
  },
});

export const complete = mutationGeneric({
  args: v.object({
    agentId: v.string(),
    stepId: v.string(),
    status: v.string(),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
    timestamp: v.float64(),
  }),
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await getTrajectoryDoc(ctx, args.agentId, args.stepId);
    const steps = ensureStep(existing?.steps ?? [], args.stepId, args.timestamp);
    await upsertTrajectoryDoc(ctx, {
      existing,
      agentId: args.agentId,
      trajectoryId: args.stepId,
      source: args.source ?? existing?.source ?? "chat",
      status: toStatus(args.status),
      metadata: (args.metadata as Record<string, unknown> | undefined) ?? existing?.metadata,
      steps,
      startTime: existing?.startTime ?? args.timestamp,
      endTime: args.timestamp,
      updatedAt: args.timestamp,
    });
    return null;
  },
});

export const appendLlmCall = mutationGeneric({
  args: v.object({
    agentId: v.string(),
    stepId: v.string(),
    payload: v.any(),
  }),
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = (args.payload ?? {}) as Record<string, unknown>;
    const timestamp =
      typeof payload.timestamp === "number" ? payload.timestamp : Date.now();
    const existing = await getTrajectoryDoc(ctx, args.agentId, args.stepId);
    const steps = ensureStep(existing?.steps ?? [], args.stepId, timestamp).map(
      (step) =>
        step.stepId === args.stepId
          ? {
              ...step,
              llmCalls: [...(step.llmCalls ?? []), payload as LlmCall],
            }
          : step,
    );
    await upsertTrajectoryDoc(ctx, {
      existing,
      agentId: args.agentId,
      trajectoryId: args.stepId,
      source: existing?.source ?? "runtime",
      status: existing ? toStatus(existing.status) : "active",
      metadata: existing?.metadata,
      steps,
      startTime: existing?.startTime ?? timestamp,
      endTime: existing?.endTime,
      updatedAt: timestamp,
    });
    return null;
  },
});

export const appendProviderAccess = mutationGeneric({
  args: v.object({
    agentId: v.string(),
    stepId: v.string(),
    payload: v.any(),
  }),
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = (args.payload ?? {}) as Record<string, unknown>;
    const timestamp =
      typeof payload.timestamp === "number" ? payload.timestamp : Date.now();
    const existing = await getTrajectoryDoc(ctx, args.agentId, args.stepId);
    const steps = ensureStep(existing?.steps ?? [], args.stepId, timestamp).map(
      (step) =>
        step.stepId === args.stepId
          ? {
              ...step,
              providerAccesses: [
                ...(step.providerAccesses ?? []),
                payload as ProviderAccess,
              ],
            }
          : step,
    );
    await upsertTrajectoryDoc(ctx, {
      existing,
      agentId: args.agentId,
      trajectoryId: args.stepId,
      source: existing?.source ?? "runtime",
      status: existing ? toStatus(existing.status) : "active",
      metadata: existing?.metadata,
      steps,
      startTime: existing?.startTime ?? timestamp,
      endTime: existing?.endTime,
      updatedAt: timestamp,
    });
    return null;
  },
});

export const deleteTrajectories = mutationGeneric({
  args: v.object({
    agentId: v.string(),
    trajectoryIds: v.array(v.string()),
  }),
  returns: v.object({
    deleted: v.float64(),
  }),
  handler: async (ctx, args) => {
    let deleted = 0;
    for (const trajectoryId of args.trajectoryIds) {
      const existing = await getTrajectoryDoc(ctx, args.agentId, trajectoryId);
      if (!existing) continue;
      await ctx.db.delete(existing._id as any);
      deleted += 1;
    }
    return { deleted };
  },
});

export const clearAll = mutationGeneric({
  args: v.object({
    agentId: v.string(),
  }),
  returns: v.object({
    deleted: v.float64(),
  }),
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query("trajectories")
      .withIndex("by_agent_created_at", (q) => q.eq("agentId", args.agentId))
      .collect()) as TrajectoryDoc[];
    for (const row of rows) {
      await ctx.db.delete(row._id as any);
    }
    return { deleted: rows.length };
  },
});
