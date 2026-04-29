const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = process.cwd();
const skipDirs = new Set([".git", "node_modules", "dist", "build", ".next"]);
const requiredPlugins = new Set();

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    if (!entry.isFile() || entry.name !== "package.json") continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8"));
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const [name, spec] of Object.entries(pkg[section] || {})) {
        if (name.startsWith("@elizaos/plugin-") && spec === "workspace:*") {
          requiredPlugins.add(name.slice("@elizaos/".length));
        }
      }
    }
  }
}

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

walk(repoRoot);
requiredPlugins.delete("plugin-openrouter");

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

for (const pluginName of [...requiredPlugins].sort()) {
  const submodulePath = `plugins/${pluginName}`;
  const record = [...metadata.values()].find((entry) => entry.path === submodulePath);
  if (!record?.url) continue;
  const targetDir = path.join(repoRoot, "eliza", submodulePath);
  const rootManifest = path.join(targetDir, "package.json");
  const tsManifest = path.join(targetDir, "typescript", "package.json");
  if (fs.existsSync(rootManifest) || fs.existsSync(tsManifest)) continue;
  fs.rmSync(targetDir, { recursive: true, force: true });
  console.log(
    `[windows-hydrate] cloning ${submodulePath} from ${record.url}#${record.branch || "alpha"}`,
  );
  runGit([
    "clone",
    "--depth=1",
    "--branch",
    record.branch || "alpha",
    record.url,
    path.join("eliza", submodulePath),
  ]);
}
