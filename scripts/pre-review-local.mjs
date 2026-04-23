import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const scriptPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "pre-review-local.mjs",
);

if (!existsSync(scriptPath)) {
  console.warn(
    "[pre-review:local] Skipping local pre-review because the eliza workspace is not available in this checkout.",
  );
  process.exit(0);
}

const result =
  process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", "bun", scriptPath], {
        cwd: repoRoot,
        stdio: "inherit",
      })
    : spawnSync("bun", [scriptPath], {
        cwd: repoRoot,
        stdio: "inherit",
      });

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
