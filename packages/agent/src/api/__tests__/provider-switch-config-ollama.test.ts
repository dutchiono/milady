import { describe, expect, it } from "vitest";
import { resolveExistingOnboardingConnection } from "../provider-switch-config";

describe("provider-switch-config Ollama compatibility", () => {
  it("infers Ollama from the documented OpenAI-compatible workaround config", () => {
    const connection = resolveExistingOnboardingConnection({
      env: {
        OPENAI_API_KEY: "ollama",
        OPENAI_BASE_URL: "http://localhost:11434/v1",
      },
      agents: {
        defaults: {
          model: {
            primary: "qwen3:8b",
          },
        },
      },
    });

    expect(connection).toEqual({
      kind: "local-provider",
      provider: "ollama",
      apiKey: undefined,
      primaryModel: "qwen3:8b",
    });
  });
});
