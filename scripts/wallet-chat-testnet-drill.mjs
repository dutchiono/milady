#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { config as loadDotenv } from "dotenv";

const repoRoot = path.resolve(import.meta.dirname, "..");
const envPaths = [
  path.join(repoRoot, ".wallet.local.env"),
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
  MILADY_API_PORT: "31337",
};

for (const [key, value] of Object.entries(TESTNET_DEFAULTS)) {
  if (!process.env[key] || process.env[key].trim().length === 0) {
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const opts = {
    apiBase: `http://127.0.0.1:${process.env.MILADY_API_PORT ?? "31337"}`,
    timeoutMs: Number(process.env.WALLET_CHAT_DRILL_TIMEOUT_MS ?? "90000"),
    prompts: [],
    keepRunning: false,
    reuseRunning: true,
    setTradeModeAgentAuto: true,
    printConversationLog: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--keep-running") {
      opts.keepRunning = true;
      continue;
    }
    if (arg === "--no-reuse-running") {
      opts.reuseRunning = false;
      continue;
    }
    if (arg === "--no-agent-auto") {
      opts.setTradeModeAgentAuto = false;
      continue;
    }
    if (arg === "--no-log") {
      opts.printConversationLog = false;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    i += 1;
    if (key === "api-base") opts.apiBase = value;
    else if (key === "timeout-ms") opts.timeoutMs = Number(value);
    else if (key === "text") opts.prompts.push(value);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (opts.prompts.length === 0) {
    opts.prompts = [
      "what is your wallet address?",
      "what is your wallet balance?",
    ];
  }

  return opts;
}

function buildHeaders() {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
  };
  const apiToken = process.env.ELIZA_API_TOKEN?.trim();
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;
  return headers;
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data)}`,
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForApiReady(apiBase, timeoutMs) {
  const started = Date.now();
  let lastError = "unknown";
  while (Date.now() - started < timeoutMs) {
    try {
      const config = await fetchJson(
        `${apiBase}/api/wallet/config`,
        {
          method: "GET",
          headers: buildHeaders(),
        },
        5000,
      );
      return config;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Timed out waiting for API. Last error: ${lastError}`);
}

async function waitForAgentReady(apiBase, timeoutMs) {
  const started = Date.now();
  let lastState = "unknown";
  while (Date.now() - started < timeoutMs) {
    try {
      const status = await fetchJson(
        `${apiBase}/api/agent/self-status`,
        {
          method: "GET",
          headers: buildHeaders(),
        },
        5000,
      );
      lastState = String(status?.state ?? "unknown");
      if (lastState === "running") {
        return status;
      }
    } catch {
      // keep polling while runtime boots
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for agent runtime. Last state: ${lastState}`);
}

async function probeExistingApi(apiBase) {
  try {
    await fetchJson(
      `${apiBase}/api/agent/self-status`,
      {
        method: "GET",
        headers: buildHeaders(),
      },
      3000,
    );
    return true;
  } catch {
    return false;
  }
}

async function configureTradeMode(apiBase, timeoutMs, mode) {
  return fetchJson(
    `${apiBase}/api/permissions/trade-mode`,
    {
      method: "PUT",
      headers: buildHeaders(),
      body: JSON.stringify({ mode }),
    },
    timeoutMs,
  );
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!process.env.EVM_PRIVATE_KEY?.trim()) {
    throw new Error(
      "No EVM_PRIVATE_KEY loaded. Expected it in .wallet.local.env or env.",
    );
  }

  console.log(`[wallet-chat-drill] starting agent runtime at ${opts.apiBase}`);
  const shouldReuse = opts.reuseRunning && (await probeExistingApi(opts.apiBase));
  const child = shouldReuse
    ? null
    : spawn("bun", ["packages/app-core/src/runtime/dev-server.ts"], {
        cwd: repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });

  if (shouldReuse) {
    console.log(`[wallet-chat-drill] reusing existing backend at ${opts.apiBase}`);
  } else {
    child.stdout?.on("data", (chunk) => {
      process.stdout.write(String(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      process.stderr.write(String(chunk));
    });
  }

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    child?.kill("SIGINT");
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(130);
  });

  try {
    const walletConfig = await waitForApiReady(opts.apiBase, opts.timeoutMs);
    const selfStatus = await waitForAgentReady(opts.apiBase, opts.timeoutMs);
    console.log(
      `[wallet-chat-drill] wallet=${walletConfig?.evmAddress ?? "unknown"} pluginEvmLoaded=${String(walletConfig?.pluginEvmLoaded)} executionReady=${String(walletConfig?.executionReady)}`,
    );
    console.log(
      `[wallet-chat-drill] agentState=${String(selfStatus?.state ?? "unknown")} automationMode=${String(selfStatus?.automationMode ?? "unknown")}`,
    );

    if (opts.setTradeModeAgentAuto) {
      const tradeMode = await configureTradeMode(
        opts.apiBase,
        opts.timeoutMs,
        "agent-auto",
      );
      console.log(
        `[wallet-chat-drill] tradeMode=${String(tradeMode?.mode ?? "unknown")} canAgentAutoTrade=${String(tradeMode?.canAgentAutoTrade ?? "unknown")}`,
      );
    }

    const created = await fetchJson(
      `${opts.apiBase}/api/conversations`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ title: "Wallet chat drill" }),
      },
      opts.timeoutMs,
    );
    const conversationId = created?.conversation?.id;
    if (!conversationId) {
      throw new Error("Conversation creation failed: missing id");
    }

    for (const prompt of opts.prompts) {
      console.log(`\n[user] ${prompt}`);
      const reply = await fetchJson(
        `${opts.apiBase}/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: buildHeaders(),
          body: JSON.stringify({ text: prompt, mode: "power" }),
        },
        opts.timeoutMs,
      );
      console.log(`[assistant] ${String(reply?.text ?? "").trim()}`);
    }

    if (opts.printConversationLog) {
      const transcript = await fetchJson(
        `${opts.apiBase}/api/conversations/${conversationId}/messages`,
        {
          method: "GET",
          headers: buildHeaders(),
        },
        opts.timeoutMs,
      );
      console.log("\n[conversation-log]");
      for (const message of transcript?.messages ?? []) {
        const role = String(message?.role ?? "unknown");
        const text = String(message?.text ?? "").trim();
        console.log(`[${role}] ${text}`);
      }
    }

    if (opts.keepRunning) {
      console.log("[wallet-chat-drill] keeping runtime alive. Press Ctrl+C to stop.");
      await new Promise(() => {});
    }
  } finally {
    if (!opts.keepRunning) {
      shutdown();
    }
  }
}

main().catch((err) => {
  console.error(
    `[wallet-chat-drill] FAILURE: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
