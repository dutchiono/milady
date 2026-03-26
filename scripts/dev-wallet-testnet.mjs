import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { config as loadDotenv } from "dotenv";
import { Wallet } from "ethers";
import JSON5 from "json5";

const repoRoot = path.resolve(import.meta.dirname, "..");
const walletSecretEnvPath = path.join(repoRoot, ".wallet.local.env");
const envPaths = [
  walletSecretEnvPath,
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.wallet.testnet"),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

const TESTNET_DEFAULTS = {
  MILADY_WALLET_NETWORK: "testnet",
  ELIZA_DEV_ONCHAIN: "0",
  BSC_TESTNET_CHAIN_ID: "97",
  BSC_TESTNET_RPC_URL: "https://data-seed-prebsc-1-s2.bnbchain.org:8545/",
  BSC_TESTNET_SWAP_ROUTER_ADDRESS: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
  BSC_TESTNET_WRAPPED_NATIVE_ADDRESS: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};

for (const [key, value] of Object.entries(TESTNET_DEFAULTS)) {
  if (!process.env[key] || process.env[key].trim().length === 0) {
    process.env[key] = value;
  }
}

function upsertEnvVar(filePath, key, value) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const line = `${key}=${value}`;
  const keyRe = new RegExp(`^${key}=.*$`, "m");
  const next = keyRe.test(current)
    ? current.replace(keyRe, line)
    : `${current.replace(/\s*$/, "\n")}${line}\n`;
  fs.writeFileSync(filePath, next);
}

function resolveElizaConfigPath() {
  const explicit = process.env.ELIZA_CONFIG_PATH?.trim();
  if (explicit) return path.resolve(explicit);
  const stateDir =
    process.env.ELIZA_STATE_DIR?.trim() ||
    path.join(
      os.homedir(),
      `.${(process.env.ELIZA_NAMESPACE?.trim() || "eliza").trim()}`,
    );
  const namespace = (process.env.ELIZA_NAMESPACE?.trim() || "eliza").trim();
  return path.join(path.resolve(stateDir), `${namespace}.json`);
}

function readPersistedEvmKeyFromConfig() {
  try {
    const configPath = resolveElizaConfigPath();
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON5.parse(raw);
    const key =
      typeof parsed?.env?.EVM_PRIVATE_KEY === "string"
        ? parsed.env.EVM_PRIVATE_KEY.trim()
        : "";
    return key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

const envPath = path.join(repoRoot, ".env");
const persistedKey = readPersistedEvmKeyFromConfig();
if (persistedKey) {
  const currentKey = process.env.EVM_PRIVATE_KEY?.trim() || "";
  if (!currentKey || currentKey !== persistedKey) {
    process.env.EVM_PRIVATE_KEY = persistedKey;
    try {
      upsertEnvVar(walletSecretEnvPath, "EVM_PRIVATE_KEY", persistedKey);
      console.log(
        `[dev:wallet:testnet] Reusing persisted EVM wallet ${new Wallet(persistedKey).address} from config and syncing ${path.basename(walletSecretEnvPath)}.`,
      );
    } catch {
      // no-op: runtime env is already set
    }
  }
}

if (!process.env.EVM_PRIVATE_KEY || process.env.EVM_PRIVATE_KEY.trim().length === 0) {
  const wallet = Wallet.createRandom();
  process.env.EVM_PRIVATE_KEY = wallet.privateKey;
  try {
    upsertEnvVar(walletSecretEnvPath, "EVM_PRIVATE_KEY", wallet.privateKey);
    console.log(
      `[dev:wallet:testnet] Generated local EVM wallet ${wallet.address} and saved EVM_PRIVATE_KEY to ${walletSecretEnvPath}.`,
    );
  } catch (err) {
    console.warn(
      `[dev:wallet:testnet] Generated local EVM wallet ${wallet.address} but could not persist to ${walletSecretEnvPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const requiredVars = ["BSC_TESTNET_RPC_URL"];
const missing = requiredVars.filter(
  (key) => !process.env[key] || process.env[key].trim().length === 0,
);
if (missing.length > 0) {
  const envPath = path.join(repoRoot, ".env");
  console.error(
    [
      "[dev:wallet:testnet] Missing required env vars:",
      ...missing.map((key) => `- ${key}`),
      `Set them in your shell or in ${envPath}.`,
    ].join("\n"),
  );
  process.exit(1);
}

const devScript = process.platform === "win32" ? "dev:win" : "dev";
const child = spawn("bun", ["run", devScript], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
