const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = process.cwd();

function runGit(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getGitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const metadata = new Map();
const configOutput = getGitOutput([
  "-C",
  "eliza",
  "config",
  "-f",
  ".gitmodules",
  "--get-regexp",
  "^submodule\\..*\\.(path|url|branch)$",
]);

for (const line of configOutput.split(/\r?\n/).filter(Boolean)) {
  const [key, value] = line.split(/\s+/, 2);
  const match = key.match(/^submodule\.(.+)\.(path|url|branch)$/);
  if (!match) continue;
  const [, name, field] = match;
  const record = metadata.get(name) || {};
  record[field] = value;
  metadata.set(name, record);
}

for (const record of [...metadata.values()].sort((a, b) =>
  (a.path || "").localeCompare(b.path || ""),
)) {
  if (!record.path?.startsWith("plugins/")) continue;
  if (record.path === "plugins/plugin-openrouter") continue;
  const targetDir = path.join(repoRoot, "eliza", record.path);
  const rootManifest = path.join(targetDir, "package.json");
  const tsManifest = path.join(targetDir, "typescript", "package.json");
  if (fs.existsSync(rootManifest) || fs.existsSync(tsManifest)) continue;
  fs.rmSync(targetDir, { recursive: true, force: true });
  console.log(
    `[windows-hydrate] cloning ${record.path} from ${record.url}#${record.branch || "alpha"}`,
  );
  runGit([
    "clone",
    "--depth=1",
    "--branch",
    record.branch || "alpha",
    record.url,
    path.join("eliza", record.path),
  ]);
}
