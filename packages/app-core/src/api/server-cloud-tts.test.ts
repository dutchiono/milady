import { describe, expect, it } from "vitest";
import { resolveCloudVoiceName } from "./server-cloud-tts";

describe("resolveCloudVoiceName", () => {
  it("keeps explicit ElevenLabs voice IDs unchanged", () => {
    expect(resolveCloudVoiceName("XrExE9yKIg1WjnnlVkGX")).toBe(
      "XrExE9yKIg1WjnnlVkGX",
    );
  });

  it("falls back to ELIZAOS_CLOUD_TTS_VOICE when request does not set voice", () => {
    expect(
      resolveCloudVoiceName(undefined, {
        ELIZAOS_CLOUD_TTS_VOICE: "n7Wi4g1bhpw4Bs8HK5ph",
      } as NodeJS.ProcessEnv),
    ).toBe("n7Wi4g1bhpw4Bs8HK5ph");
  });

  it("uses a deterministic default voice ID when none is provided", () => {
    expect(resolveCloudVoiceName(undefined, {} as NodeJS.ProcessEnv)).toBe(
      "EXAVITQu4vr4xnSDxMaL",
    );
  });
});
