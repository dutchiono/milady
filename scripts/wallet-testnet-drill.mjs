#!/usr/bin/env node
import process from "node:process";

function parseArgs(argv) {
  const opts = {
    apiBase:
      process.env.WALLET_DRILL_API_BASE ??
      `http://127.0.0.1:${process.env.MILADY_API_PORT ?? "31337"}`,
    tokenAddress: process.env.WALLET_DRILL_TOKEN_ADDRESS ?? "",
    amount: process.env.WALLET_DRILL_AMOUNT ?? "0.001",
    side: process.env.WALLET_DRILL_SIDE ?? "buy",
    slippageBps: Number(process.env.WALLET_DRILL_SLIPPAGE_BPS ?? "100"),
    routeProvider: process.env.WALLET_DRILL_ROUTE_PROVIDER ?? "pancakeswap-v2",
    timeoutMs: Number(process.env.WALLET_DRILL_TIMEOUT_MS ?? "60000"),
    quoteOnly: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--quote-only") {
      opts.quoteOnly = true;
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
    else if (key === "token") opts.tokenAddress = value;
    else if (key === "amount") opts.amount = value;
    else if (key === "side") opts.side = value;
    else if (key === "slippage-bps") opts.slippageBps = Number(value);
    else if (key === "route-provider") opts.routeProvider = value;
    else if (key === "timeout-ms") opts.timeoutMs = Number(value);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return opts;
}

function assertCondition(condition, message, details) {
  if (condition) return;
  const suffix =
    details === undefined ? "" : `\nDetails: ${JSON.stringify(details, null, 2)}`;
  throw new Error(`${message}${suffix}`);
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

async function tryWalletConfig(apiBase, timeoutMs) {
  const data = await fetchJson(
    `${apiBase}/api/wallet/config`,
    {
      method: "GET",
      headers: buildHeaders(),
    },
    timeoutMs,
  );
  if (!data || typeof data !== "object" || !("walletNetwork" in data)) {
    throw new Error("wallet config response missing walletNetwork");
  }
  return data;
}

async function discoverApiBase(timeoutMs) {
  const envPort = Number(process.env.MILADY_API_PORT ?? "");
  const candidatePorts = [];
  if (Number.isFinite(envPort) && envPort > 0) {
    candidatePorts.push(envPort);
  }
  for (let port = 31337; port <= 31367; port += 1) {
    if (!candidatePorts.includes(port)) candidatePorts.push(port);
  }

  for (const port of candidatePorts) {
    const base = `http://127.0.0.1:${port}`;
    try {
      await tryWalletConfig(base, Math.min(timeoutMs, 1500));
      return base;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `Could not auto-discover API base. Tried ports ${candidatePorts[0]}-${candidatePorts[candidatePorts.length - 1]}.`,
  );
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
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
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
  let attempt = 0;
  while (Date.now() - started < timeoutMs) {
    try {
      const config = await tryWalletConfig(apiBase, Math.min(timeoutMs, 5000));
      return config;
    } catch (err) {
      attempt += 1;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt % 5 === 0) {
        console.log(
          `[wallet-drill] waiting for API at ${apiBase}... (${Math.floor((Date.now() - started) / 1000)}s)`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Timed out waiting for API readiness. Last error: ${lastError}`);
}

function summarizeQuote(quote) {
  if (!quote || typeof quote !== "object") return {};
  return {
    routeProvider: quote.routeProvider,
    routeProviderRequested: quote.routeProviderRequested,
    routeProviderFallbackUsed: quote.routeProviderFallbackUsed,
    routeProviderNotes: quote.routeProviderNotes,
    routerAddress: quote.routerAddress,
    quoteIn: quote.quoteIn,
    quoteOut: quote.quoteOut,
  };
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!process.env.WALLET_DRILL_API_BASE) {
    opts.apiBase = await discoverApiBase(Math.min(opts.timeoutMs, 10000));
  }

  assertCondition(
    opts.side === "buy" || opts.side === "sell",
    "side must be either \"buy\" or \"sell\".",
  );
  assertCondition(
    opts.routeProvider === "pancakeswap-v2" ||
      opts.routeProvider === "0x" ||
      opts.routeProvider === "auto",
    "route-provider must be one of: pancakeswap-v2, 0x, auto.",
  );
  assertCondition(
    opts.tokenAddress.trim().length > 0,
    "Token address is required. Set WALLET_DRILL_TOKEN_ADDRESS or pass --token.",
  );
  assertCondition(
    Number.isFinite(opts.slippageBps) && opts.slippageBps >= 0,
    "slippage-bps must be a non-negative number.",
  );

  console.log(`[wallet-drill] API: ${opts.apiBase}`);
  console.log(`[wallet-drill] side=${opts.side} amount=${opts.amount}`);
  console.log(`[wallet-drill] routeProvider=${opts.routeProvider}`);

  const config = await waitForApiReady(opts.apiBase, opts.timeoutMs);
  assertCondition(
    config?.walletNetwork === "testnet",
    "Runtime wallet network is not testnet.",
    config,
  );

  const addresses = await fetchJson(
    `${opts.apiBase}/api/wallet/addresses`,
    {
      method: "GET",
      headers: buildHeaders(),
    },
    opts.timeoutMs,
  );
  console.log(`[wallet-drill] EVM address: ${addresses?.evmAddress ?? "unknown"}`);

  const payload = {
    side: opts.side,
    tokenAddress: opts.tokenAddress,
    amount: opts.amount,
    slippageBps: opts.slippageBps,
    routeProvider: opts.routeProvider,
    source: "manual",
  };

  const quoteStage = await fetchJson(
    `${opts.apiBase}/api/wallet/trade/execute`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ ...payload, confirm: false }),
    },
    opts.timeoutMs,
  );

  assertCondition(quoteStage?.ok === true, "Quote stage did not return ok=true.", quoteStage);
  assertCondition(
    quoteStage?.executed === false,
    "Quote stage should not execute on-chain (expected executed=false).",
    quoteStage,
  );
  assertCondition(
    Boolean(quoteStage?.unsignedTx),
    "Quote stage must return unsignedTx.",
    quoteStage,
  );
  console.log("[wallet-drill] Stage 1 passed: quote/build path OK.");
  console.log(
    `[wallet-drill] Stage 1 route: ${JSON.stringify(summarizeQuote(quoteStage?.quote))}`,
  );

  if (opts.quoteOnly) {
    console.log("[wallet-drill] quote-only enabled, skipping confirm=true stage.");
    return;
  }

  const execStage = await fetchJson(
    `${opts.apiBase}/api/wallet/trade/execute`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ ...payload, confirm: true }),
    },
    opts.timeoutMs,
  );

  assertCondition(execStage?.ok === true, "Execution stage did not return ok=true.", execStage);
  assertCondition(
    execStage?.executed === true,
    "Execution stage must set executed=true.",
    execStage,
  );
  assertCondition(
    typeof execStage?.execution?.hash === "string" &&
      execStage.execution.hash.trim().length > 0,
    "Execution stage must include execution.hash.",
    execStage,
  );

  console.log("[wallet-drill] Stage 2 passed: on-chain execution reported.");
  console.log(`[wallet-drill] tx hash: ${execStage.execution.hash}`);
  console.log(
    `[wallet-drill] Stage 2 route: ${JSON.stringify(summarizeQuote(execStage?.quote))}`,
  );
  console.log("[wallet-drill] SUCCESS: tx hash present + executed=true.");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[wallet-drill] FAILURE: ${message}`);
  process.exit(1);
});
