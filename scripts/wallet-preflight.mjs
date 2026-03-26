#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";

const TEST_FILES = [
  "packages/app-core/src/runtime/eliza.test.ts",
  "packages/app-core/src/config/plugin-auto-enable.test.ts",
  "packages/agent/src/api/__tests__/wallet-rpc-network.test.ts",
  "packages/agent/src/api/__tests__/bsc-trade-network.test.ts",
  "packages/app-core/src/actions/execute-trade.test.ts",
  "packages/app-core/src/actions/transfer-token.test.ts",
  "packages/agent/test/api/wallet-trade-routes.test.ts",
];

const cwd = process.cwd();
const bunTmp = process.env.BUN_TMPDIR ?? path.join(cwd, ".bun-tmp");
const bunInstall = process.env.BUN_INSTALL ?? path.join(cwd, ".bun-install");

const env = {
  ...process.env,
  BUN_TMPDIR: bunTmp,
  BUN_INSTALL: bunInstall,
  TMP: process.env.TMP ?? bunTmp,
  TEMP: process.env.TEMP ?? bunTmp,
};

const args = ["vitest", "run", ...TEST_FILES];
console.log(`[wallet-preflight] Running: bunx ${args.join(" ")}`);

const result = spawnSync("bunx", args, {
  cwd,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
