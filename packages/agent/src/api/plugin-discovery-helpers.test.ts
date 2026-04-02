import { describe, expect, it } from "vitest";
import { aggregateSecrets } from "./plugin-discovery-helpers";

describe("aggregateSecrets", () => {
  it("includes convex backend auth in managed secrets when convex is configured", () => {
    const secrets = aggregateSecrets([], {
      backend: {
        kind: "convex",
        convex: {
          enabled: true,
          url: "https://example.convex.cloud",
          deployment: "dev:milady",
        },
      },
      env: {
        CONVEX_ADMIN_KEY: "convex-secret",
      },
    } as never);

    expect(secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "CONVEX_ADMIN_KEY",
          category: "auth",
          isSet: true,
          required: true,
          usedBy: [
            expect.objectContaining({
              pluginId: "convex-backend",
              pluginName: "Convex Backend",
              enabled: true,
            }),
          ],
        }),
      ]),
    );
  });
});
