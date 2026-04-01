import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("qa tracker auth configuration", () => {
  const html = readFileSync(
    resolve(import.meta.dirname, "../docs/qa-tracker/index.html"),
    "utf8",
  );

  it("prefers GitHub OAuth for public repos", () => {
    expect(html).toContain("Sign in with GitHub");
    expect(html).toContain(
      "Use the GitHub button for normal access on a public repo",
    );
    expect(html).toContain("scope: 'public_repo'");
  });

  it("keeps PAT as fallback only", () => {
    expect(html).toContain("Personal Access Token (fallback)");
    expect(html).toContain("Only use this if OAuth is not configured yet.");
    expect(html).toContain("scopes=public_repo");
  });
});
