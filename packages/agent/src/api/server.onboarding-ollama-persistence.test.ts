import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "./server";

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  } catch {
    // Ignore cleanup failures in tests
  }
}

async function waitForConfig(
  configPath: string,
  predicate: (config: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (predicate(parsed)) {
        return parsed;
      }
    } catch {
      // Retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("POST /api/onboarding ollama persistence", () => {
  const ENV_KEYS_TO_SAVE = ["ELIZA_STATE_DIR", "MILADY_STATE_DIR"] as const;
  const savedEnv = new Map<string, string | undefined>();
  for (const key of ENV_KEYS_TO_SAVE) {
    savedEnv.set(key, process.env[key]);
  }

  afterEach(async () => {
    for (const key of ENV_KEYS_TO_SAVE) {
      const original = savedEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it("persists legacy ollama onboarding selections across restart", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "eliza-onboarding-ollama-"),
    );
    process.env.ELIZA_STATE_DIR = tempDir;
    process.env.MILADY_STATE_DIR = tempDir;
    const configPath = path.join(tempDir, "eliza.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({ logging: { level: "error" } }),
    );

    const server = await startApiServer({ port: 0 });

    try {
      const { status } = await req(server.port, "POST", "/api/onboarding", {
        name: "Chen",
        bio: ["A local ollama guide."],
        systemPrompt: "You are Chen.",
        runMode: "local",
        provider: "ollama",
        primaryModel: "ollama/qwen3.5:27b",
      });

      expect(status).toBe(200);

      const config = await waitForConfig(configPath, (candidate) => {
        const defaults = ((candidate.agents ?? {}) as Record<string, unknown>)
          .defaults as Record<string, unknown> | undefined;
        return defaults?.subscriptionProvider === "ollama";
      });

      const defaults = ((config.agents ?? {}) as Record<string, unknown>)
        .defaults as Record<string, unknown>;
      const model = (defaults.model ?? {}) as Record<string, unknown>;
      const connection = (config.connection ?? {}) as Record<string, unknown>;

      expect(defaults.subscriptionProvider).toBe("ollama");
      expect(model.primary).toBe("ollama/qwen3.5:27b");
      expect(connection).toMatchObject({
        kind: "local-provider",
        provider: "ollama",
        primaryModel: "ollama/qwen3.5:27b",
      });
    } finally {
      await server.close();
    }

    const restarted = await startApiServer({ port: 0 });
    try {
      const { status, data } = await req(
        restarted.port,
        "GET",
        "/api/onboarding/status",
      );

      expect(status).toBe(200);
      expect(data.complete).toBe(true);
    } finally {
      await restarted.close();
      await cleanupTempDir(tempDir);
    }
  });
});
