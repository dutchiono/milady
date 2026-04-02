import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const llmCallValidator = v.object({
  callId: v.optional(v.string()),
  timestamp: v.optional(v.float64()),
  model: v.optional(v.string()),
  systemPrompt: v.optional(v.string()),
  userPrompt: v.optional(v.string()),
  response: v.optional(v.string()),
  temperature: v.optional(v.float64()),
  maxTokens: v.optional(v.float64()),
  purpose: v.optional(v.string()),
  actionType: v.optional(v.string()),
  latencyMs: v.optional(v.float64()),
  promptTokens: v.optional(v.float64()),
  completionTokens: v.optional(v.float64()),
});

const providerAccessValidator = v.object({
  providerId: v.optional(v.string()),
  providerName: v.optional(v.string()),
  purpose: v.optional(v.string()),
  data: v.optional(v.any()),
  query: v.optional(v.any()),
  timestamp: v.optional(v.float64()),
});

const stepValidator = v.object({
  stepId: v.optional(v.string()),
  timestamp: v.float64(),
  llmCalls: v.optional(v.array(llmCallValidator)),
  providerAccesses: v.optional(v.array(providerAccessValidator)),
});

export default defineSchema({
  trajectories: defineTable({
    agentId: v.string(),
    trajectoryId: v.string(),
    source: v.string(),
    status: v.string(),
    startTime: v.float64(),
    endTime: v.optional(v.float64()),
    durationMs: v.optional(v.float64()),
    stepCount: v.float64(),
    llmCallCount: v.float64(),
    providerAccessCount: v.float64(),
    totalPromptTokens: v.float64(),
    totalCompletionTokens: v.float64(),
    createdAt: v.string(),
    updatedAt: v.string(),
    metadata: v.optional(v.any()),
    steps: v.array(stepValidator),
  })
    .index("by_agent_created_at", ["agentId", "createdAt"])
    .index("by_agent_trajectory", ["agentId", "trajectoryId"]),
});
