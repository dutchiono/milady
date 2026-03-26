/**
 * Inventory view — unified wallet balances, NFTs, and scoped BSC trading.
 *
 * This is a thin coordinator that delegates rendering to sub-components
 * inside the ./inventory/ directory.
 */

import type { StewardStatusResponse } from "@miladyai/app-core/api";
import { client } from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@miladyai/ui";
import {
  Coins,
  Copy,
  Image as ImageIcon,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  APP_PANEL_SHELL_CLASSNAME,
  APP_SIDEBAR_CARD_ACTIVE_CLASSNAME,
  APP_SIDEBAR_CARD_BASE_CLASSNAME,
  APP_SIDEBAR_CARD_INACTIVE_CLASSNAME,
  APP_SIDEBAR_HEADER_CLASSNAME,
  APP_SIDEBAR_INNER_CLASSNAME,
  APP_SIDEBAR_KICKER_CLASSNAME,
  APP_SIDEBAR_META_CLASSNAME,
  APP_SIDEBAR_PILL_CLASSNAME,
  APP_SIDEBAR_RAIL_CLASSNAME,
} from "./sidebar-shell-styles";
import { TradePanel } from "./BscTradePanel";
import {
  CHAIN_CONFIGS,
  type ChainKey,
  PRIMARY_CHAIN_KEYS,
  chainKeyToWalletRpcChain,
  resolveChainKey,
} from "./chainConfig";
import {
  BSC_GAS_READY_THRESHOLD,
  loadTrackedBscTokens,
  loadTrackedTokens,
  removeTrackedBscToken,
  saveTrackedTokens,
  type TrackedToken,
} from "./inventory";
import { NftGrid } from "./inventory/NftGrid";
import { TokensTable } from "./inventory/TokensTable";
import { useInventoryData } from "./inventory/useInventoryData";

/* ── Component ─────────────────────────────────────────────────────── */

const WALLET_SHELL_CLASS = APP_PANEL_SHELL_CLASSNAME;
const WALLET_SIDEBAR_CLASS = `lg:w-[21rem] lg:max-w-[352px] ${APP_SIDEBAR_RAIL_CLASSNAME}`;
const WALLET_SIDEBAR_KICKER_CLASS = APP_SIDEBAR_KICKER_CLASSNAME;
const WALLET_SIDEBAR_ITEM_BASE_CLASS = APP_SIDEBAR_CARD_BASE_CLASSNAME;
const WALLET_SIDEBAR_ITEM_ACTIVE_CLASS = APP_SIDEBAR_CARD_ACTIVE_CLASSNAME;
const WALLET_SIDEBAR_ITEM_INACTIVE_CLASS = APP_SIDEBAR_CARD_INACTIVE_CLASSNAME;
const WALLET_PANEL_CLASS =
  "rounded-[28px] border border-border/35 bg-bg/20 shadow-sm ring-1 ring-border/10";

function countVisibleAssetsForFocus(
  focus: string,
  rows:
    | Array<{
        chain: string;
        balanceRaw: number;
        valueUsd: number;
        isTracked?: boolean;
      }>
    | undefined,
): number {
  return (rows ?? []).filter((row) => {
    const hasBalance = row.isTracked || row.balanceRaw > 0 || row.valueUsd > 0;
    if (!hasBalance) return false;
    if (focus === "all") return true;
    return resolveChainKey(row.chain) === focus;
  }).length;
}

export function InventoryView({ inModal }: { inModal?: boolean } = {}) {
  const {
    walletConfig,
    walletAddresses,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    inventoryView,
    inventorySort,
    inventoryChainFocus,
    walletError,
    loadBalances,
    loadNfts,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    elizaCloudLoginError,
    handleCloudLogin,
    setTab,
    setState,
    setActionNotice,
    executeBscTrade,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    getStewardStatus,
    copyToClipboard,
    handleExportKeys,
    t,
  } = useApp();

  const cloudLoginHelpUrl = useMemo(() => {
    const match = elizaCloudLoginError?.match(/https?:\/\/[^\s]+/i);
    return match ? match[0] : null;
  }, [elizaCloudLoginError]);

  // ── Tracked tokens state ──────────────────────────────────────────
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() =>
    loadTrackedTokens(),
  );
  const [trackedBscTokens, setTrackedBscTokens] =
    useState(loadTrackedBscTokens);

  // ── Steward status ────────────────────────────────────────────────
  const [stewardStatus, setStewardStatus] =
    useState<StewardStatusResponse | null>(null);
  const [privyConfigured, setPrivyConfigured] = useState<boolean | null>(null);
  const [localSignerAvailable, setLocalSignerAvailable] = useState<
    boolean | null
  >(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardMode, setWizardMode] = useState<"managed" | "local" | null>(
    null,
  );
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardNotice, setWizardNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const [wizardAddresses, setWizardAddresses] = useState<{
    evmAddress: string | null;
    solanaAddress: string | null;
  } | null>(null);
  const [localImportChain, setLocalImportChain] = useState<"evm" | "solana">(
    "evm",
  );
  const [localImportKey, setLocalImportKey] = useState("");

  useEffect(() => {
    if (typeof getStewardStatus !== "function") {
      return;
    }

    let cancelled = false;
    getStewardStatus()
      .then((s) => {
        if (!cancelled) setStewardStatus(s);
      })
      .catch(() => {
        /* steward not available — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [getStewardStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [privy, selfStatus] = await Promise.all([
          client.getPrivyStatus(),
          client.getAgentSelfStatus(),
        ]);
        if (cancelled) return;
        setPrivyConfigured(Boolean(privy?.configured));
        setLocalSignerAvailable(Boolean(selfStatus?.wallet?.localSignerAvailable));
      } catch {
        if (cancelled) return;
        setPrivyConfigured(null);
        setLocalSignerAvailable(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── RPC + wallet readiness ───────────────────────────────────────
  const cfg = walletConfig;
  const hasManagedBscRpc = Boolean(cfg?.managedBscRpcReady);
  const cloudManagedAccess = Boolean(
    cfg?.cloudManagedAccess || elizaCloudConnected,
  );

  const goToRpcSettings = useCallback(() => {
    setTab("settings");
    setTimeout(() => {
      document
        .getElementById("wallet-rpc")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, [setTab]);

  // ── Derived data (hook) ───────────────────────────────────────────
  const {
    chainFocus,
    tokenRows,
    allNfts,
    focusedChainError,
    focusedChainName,
    visibleRows,
    totalUsd,
    visibleChainErrors,
    focusedNativeBalance,
  } = useInventoryData({
    walletBalances,
    walletAddresses,
    walletConfig,
    walletNfts,
    inventorySort,
    inventoryChainFocus,
    trackedBscTokens,
    trackedTokens,
  });

  const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
  const solAddr = walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;
  const loadedEvmChainKeys = new Set(
    (walletBalances?.evm?.chains ?? [])
      .filter((chain) => !chain.error)
      .map((chain) => resolveChainKey(chain.chain))
      .filter((chainKey): chainKey is ChainKey => chainKey !== null),
  );
  const evmChainErrors = new Map(
    (walletBalances?.evm?.chains ?? [])
      .map((chain) => [resolveChainKey(chain.chain), chain.error] as const)
      .filter((entry): entry is [ChainKey, string | null] => entry[0] !== null),
  );
  const ethereumReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("ethereum") &&
      (loadedEvmChainKeys.has("ethereum") ||
        cfg?.ethereumBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const baseReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("base") &&
      (loadedEvmChainKeys.has("base") ||
        cfg?.baseBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const bscReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("bsc") &&
      (loadedEvmChainKeys.has("bsc") ||
        cfg?.bscBalanceReady ||
        cfg?.ankrKeySet ||
        hasManagedBscRpc),
  );
  const avaxReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("avax") &&
      (loadedEvmChainKeys.has("avax") ||
        cfg?.avalancheBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const solanaReady = Boolean(
    solAddr &&
      (Boolean(walletBalances?.solana) ||
        cfg?.solanaBalanceReady ||
        cfg?.heliusKeySet ||
        cloudManagedAccess),
  );
  const bnbBalance = Number.parseFloat(focusedNativeBalance ?? "0") || 0;
  const tradeReady =
    chainFocus === "bsc" ? bnbBalance >= BSC_GAS_READY_THRESHOLD : true;
  const addresses = [
    evmAddr ? { label: "EVM", address: evmAddr } : null,
    solAddr ? { label: "Solana", address: solAddr } : null,
  ].filter((item): item is { label: string; address: string } => Boolean(item));
  const addressStatusRows = [
    { label: "EVM", address: evmAddr ?? null },
    { label: "Solana", address: solAddr ?? null },
  ] as const;
  const capabilityRows = [
    {
      label: "Wallet source",
      value: cfg?.walletSource === "local"
        ? "Local signer"
        : cfg?.walletSource === "managed"
          ? "Managed (Privy/Cloud)"
          : "Not ready",
    },
    {
      label: "BSC RPC",
      value: cfg?.rpcReady ? "Ready" : "Not configured",
    },
    {
      label: "plugin-evm",
      value: cfg?.pluginEvmLoaded ? "Loaded" : "Not loaded",
    },
    {
      label: "Automation mode",
      value: cfg?.automationMode ?? "unknown",
    },
  ] as const;
  const capabilitySummary = cfg?.executionReady
    ? "Ready for wallet actions"
    : cfg?.executionBlockedReason ?? "Wallet execution is blocked";

  const chainItemMeta = useMemo(() => {
    const totalAssetCount = countVisibleAssetsForFocus("all", tokenRows);
    const items = [
      {
        key: "all",
        label: "All Assets",
        description:
          totalAssetCount > 0
            ? `${totalAssetCount} assets across connected wallets`
            : "Browse every connected chain from one place",
      },
    ];

    for (const key of PRIMARY_CHAIN_KEYS) {
      const config = CHAIN_CONFIGS[key];
      const assetCount = countVisibleAssetsForFocus(key, tokenRows);
      const chainReady =
        key === "ethereum"
          ? ethereumReady
          : key === "base"
            ? baseReady
            : key === "bsc"
              ? bscReady
              : key === "avax"
                ? avaxReady
                : key === "solana"
                  ? solanaReady
                  : false;
      const hasAddress = key === "solana" ? Boolean(solAddr) : Boolean(evmAddr);

      items.push({
        key,
        label: config.name,
        description: !hasAddress
          ? "No wallet address yet"
          : chainReady
            ? assetCount > 0
              ? `${assetCount} visible assets`
              : "Connected and ready"
            : "Needs RPC setup",
      });
    }

    return items;
  }, [
    avaxReady,
    baseReady,
    bscReady,
    ethereumReady,
    evmAddr,
    solAddr,
    solanaReady,
    tokenRows,
  ]);

  const focusedChainLabel =
    focusedChainName ??
    (chainFocus !== "all"
      ? (CHAIN_CONFIGS[chainFocus as keyof typeof CHAIN_CONFIGS]?.name ??
        chainFocus)
      : null);
  const walletPageTitle =
    chainFocus === "all"
      ? inventoryView === "tokens"
        ? "Wallet Overview"
        : "NFT Gallery"
      : `${focusedChainLabel ?? "Chain"} ${inventoryView === "tokens" ? "Assets" : "NFTs"}`;
  const walletPageDescription =
    chainFocus === "all"
      ? inventoryView === "tokens"
        ? "Track balances, managed addresses, and trading readiness in one place."
        : "Review collectibles across every connected wallet."
      : inventoryView === "tokens"
        ? `Balances and watchlist activity for ${focusedChainLabel ?? "the selected chain"}.`
        : `Collectibles discovered on ${focusedChainLabel ?? "the selected chain"}.`;
  const inlineError =
    chainFocus !== "all" && focusedChainError
      ? {
          message: `${focusedChainLabel ?? "Chain"}: ${focusedChainError}`,
          retryTitle: `Retry fetching ${focusedChainLabel ?? "chain"} balances`,
        }
      : null;

  const legacyRpcChain = chainKeyToWalletRpcChain(chainFocus);
  const headerWarning =
    chainFocus !== "all" &&
    legacyRpcChain !== null &&
    cfg?.legacyCustomChains?.includes(legacyRpcChain)
      ? {
          title: `${
            focusedChainLabel ??
            (chainFocus === "bsc"
              ? "BSC"
              : chainFocus === "solana"
                ? "Solana"
                : "EVM")
          } is using legacy raw RPC config.`,
          body: "Re-save a supported provider in Settings to migrate fully.",
          actionLabel: t("wallet.setup.configureRpc"),
        }
      : chainFocus === "bsc" && evmAddr && !bscReady
        ? {
            title: t("wallet.setup.rpcNotConfigured"),
            body: t("portfolioheader.ConnectViaElizaCl"),
            actionLabel: t("wallet.setup.configureRpc"),
          }
        : chainFocus === "solana" && solAddr && !solanaReady
          ? {
              title: "Solana RPC is not configured.",
              body: "Connect via Eliza Cloud or configure HELIUS_API_KEY / SOLANA_RPC_URL in Settings to load Solana balances.",
              actionLabel: t("wallet.setup.configureRpc"),
            }
          : chainFocus !== "all" &&
              chainFocus !== "bsc" &&
              chainFocus !== "solana" &&
              evmAddr &&
              !(chainFocus === "ethereum"
                ? ethereumReady
                : chainFocus === "base"
                  ? baseReady
                  : chainFocus === "avax"
                    ? avaxReady
                    : false)
            ? {
                title: `${focusedChainLabel ?? "Chain"} access is not configured.`,
                body: `Connect via Eliza Cloud or configure ${focusedChainLabel ?? "this chain"} RPC access in Settings to load balances.`,
                actionLabel: t("wallet.setup.configureRpc"),
              }
            : null;

  // ── Tracked token handlers ────────────────────────────────────────
  const handleAddToken = useCallback(
    (token: TrackedToken) => {
      const updated = [...trackedTokens, token];
      setTrackedTokens(updated);
      saveTrackedTokens(updated);
    },
    [trackedTokens],
  );

  const handleUntrackToken = useCallback(
    (address: string) => {
      const updated = trackedTokens.filter(
        (tk) => tk.address.toLowerCase() !== address.toLowerCase(),
      );
      setTrackedTokens(updated);
      saveTrackedTokens(updated);
      setTrackedBscTokens((prev) => removeTrackedBscToken(address, prev));
      setActionNotice(t("wallet.tokenRemovedManual"), "info", 2200);
    },
    [trackedTokens, setActionNotice, t],
  );

  const handleCopyAddress = useCallback(
    async (address: string) => {
      await copyToClipboard(address);
      setActionNotice(t("wallet.addressCopied"), "success", 2000);
    },
    [copyToClipboard, setActionNotice, t],
  );

  const refreshWalletIdentity = useCallback(async (): Promise<{
    evmAddress: string | null;
    solanaAddress: string | null;
  } | null> => {
    try {
      const cfgNow = await client.getWalletConfig();
      const nextAddresses = {
        evmAddress: cfgNow.evmAddress ?? null,
        solanaAddress: cfgNow.solanaAddress ?? null,
      };
      setState("walletConfig", cfgNow);
      setState("walletAddresses", nextAddresses);
      setState("walletError", null);
      return nextAddresses;
    } catch (err) {
      setState(
        "walletError",
        `Failed to refresh wallet status: ${
          err instanceof Error ? err.message : "network error"
        }`,
      );
      return null;
    }
  }, [setState]);

  const handleWizardModeSelect = useCallback((mode: "managed" | "local") => {
    setWizardMode(mode);
    setWizardStep(2);
    setWizardNotice(null);
  }, []);

  const handleManagedRefresh = useCallback(async () => {
    setWizardBusy(true);
    setWizardNotice(null);
    const refreshed = await refreshWalletIdentity();
    if (refreshed?.evmAddress || refreshed?.solanaAddress) {
      setWizardAddresses(refreshed);
      setWizardStep(3);
      setWizardNotice({
        tone: "success",
        text: "Managed wallet detected. You can continue to wallet assets.",
      });
    } else {
      setWizardNotice({
        tone: "error",
        text:
          privyConfigured === false
            ? "Privy provisioning is not configured on this backend. Ask the operator to set PRIVY_APP_ID and PRIVY_APP_SECRET."
            : "No managed wallet address yet. Complete login and try Refresh Wallet Status again.",
      });
    }
    setWizardBusy(false);
  }, [privyConfigured, refreshWalletIdentity]);

  const handleGenerateLocalWallet = useCallback(
    async (chain: "evm" | "solana" | "both") => {
      setWizardBusy(true);
      setWizardNotice(null);
      try {
        const result = await client.generateWallet(chain);
        const refreshed = await refreshWalletIdentity();
        const fallback = {
          evmAddress:
            result.wallets.find((w) => w.chain === "evm")?.address ?? null,
          solanaAddress:
            result.wallets.find((w) => w.chain === "solana")?.address ?? null,
        };
        setWizardAddresses({
          evmAddress: refreshed?.evmAddress ?? fallback.evmAddress,
          solanaAddress: refreshed?.solanaAddress ?? fallback.solanaAddress,
        });
        setWizardStep(3);
        setWizardNotice({
          tone: "success",
          text: `Generated ${result.wallets.length} wallet${result.wallets.length === 1 ? "" : "s"} successfully.`,
        });
      } catch (err) {
        setWizardNotice({
          tone: "error",
          text: `Failed to generate wallet: ${err instanceof Error ? err.message : "unknown error"}`,
        });
      } finally {
        setWizardBusy(false);
      }
    },
    [refreshWalletIdentity],
  );

  const handleImportLocalWallet = useCallback(async () => {
    const pk = localImportKey.trim();
    if (!pk) {
      setWizardNotice({
        tone: "error",
        text: "Private key is required for import.",
      });
      return;
    }
    setWizardBusy(true);
    setWizardNotice(null);
    try {
      const result = await client.importWallet(localImportChain, pk);
      const refreshed = await refreshWalletIdentity();
      setLocalImportKey("");
      setWizardAddresses({
        evmAddress:
          refreshed?.evmAddress ??
          (result.chain === "evm" ? result.address : null),
        solanaAddress:
          refreshed?.solanaAddress ??
          (result.chain === "solana" ? result.address : null),
      });
      setWizardStep(3);
      setWizardNotice({
        tone: "success",
        text: `Imported ${result.chain.toUpperCase()} wallet successfully.`,
      });
    } catch (err) {
      setWizardNotice({
        tone: "error",
        text: `Failed to import wallet: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    } finally {
      setWizardBusy(false);
    }
  }, [localImportChain, localImportKey, refreshWalletIdentity]);

  // ════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════

  // ── Standalone states (no two-panel layout) ─────────────────────
  if (walletLoading && !walletBalances) {
    return (
      <div className="flex h-full w-full min-h-0 bg-bg p-0 lg:p-1">
        <div className={`${WALLET_SHELL_CLASS} items-center justify-center`}>
          <div className="rounded-[28px] border border-border/35 bg-bg/20 px-6 py-10 text-center text-sm text-muted shadow-sm ring-1 ring-border/10">
            {t("wallet.loadingBalances")}
          </div>
        </div>
      </div>
    );
  }

  if (!evmAddr && !solAddr) {
    return (
      <div className="flex h-full w-full min-h-0 bg-bg p-0 lg:p-1">
        <div className={`${WALLET_SHELL_CLASS} items-center justify-center`}>
          <div className="mx-4 w-full max-w-xl rounded-[28px] border border-border/35 bg-bg/20 px-6 py-8 text-center shadow-sm ring-1 ring-border/10">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
              <Wallet className="h-6 w-6" />
            </div>
            <div className="text-base font-semibold text-txt-strong">
              {t("wallet.noOnchainWallet")}
            </div>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              {t("wallet.noOnchainWalletHint")}
            </p>
            <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-border/30 bg-bg/20 px-4 py-3 text-left text-xs text-muted">
              <div className="font-medium text-txt-strong">
                Wallet setup wizard (Step {wizardStep} of 3)
              </div>
              {wizardStep === 1 ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-auto flex-col items-start rounded-xl px-4 py-3 text-left"
                    onClick={() => handleWizardModeSelect("managed")}
                  >
                    <span className="text-sm font-semibold">Managed (Privy)</span>
                    <span className="text-xs text-muted">
                      Best for regular users. Login and wallet appears automatically.
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto flex-col items-start rounded-xl px-4 py-3 text-left"
                    onClick={() => handleWizardModeSelect("local")}
                  >
                    <span className="text-sm font-semibold">Local wallet</span>
                    <span className="text-xs text-muted">
                      Generate/import your own keys and execute with local signer.
                    </span>
                  </Button>
                </div>
              ) : null}
              {wizardStep === 2 && wizardMode === "managed" ? (
                <div className="mt-3 space-y-2">
                  <ol className="list-inside list-decimal space-y-1">
                    <li>Click "Log in with Privy".</li>
                    <li>Finish auth in browser.</li>
                    <li>Click "Refresh Wallet Status".</li>
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="rounded-full px-5"
                      disabled={elizaCloudLoginBusy || wizardBusy}
                      onClick={() => void handleCloudLogin()}
                    >
                      {elizaCloudLoginBusy ? "Opening Privy login..." : "Log in with Privy"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full px-5"
                      disabled={wizardBusy}
                      onClick={() => void handleManagedRefresh()}
                    >
                      {wizardBusy ? "Checking..." : "Refresh Wallet Status"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full px-5"
                      onClick={() => {
                        setWizardMode(null);
                        setWizardStep(1);
                      }}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              ) : null}
              {wizardStep === 2 && wizardMode === "local" ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="mb-1 font-medium text-txt-strong">Generate</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={wizardBusy}
                        onClick={() => void handleGenerateLocalWallet("both")}
                      >
                        Generate both
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={wizardBusy}
                        onClick={() => void handleGenerateLocalWallet("evm")}
                      >
                        Generate EVM
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={wizardBusy}
                        onClick={() => void handleGenerateLocalWallet("solana")}
                      >
                        Generate Solana
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 font-medium text-txt-strong">Import</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={localImportChain === "evm" ? "default" : "outline"}
                        disabled={wizardBusy}
                        onClick={() => setLocalImportChain("evm")}
                      >
                        EVM
                      </Button>
                      <Button
                        size="sm"
                        variant={localImportChain === "solana" ? "default" : "outline"}
                        disabled={wizardBusy}
                        onClick={() => setLocalImportChain("solana")}
                      >
                        Solana
                      </Button>
                    </div>
                    <Input
                      className="mt-2"
                      type="password"
                      placeholder={
                        localImportChain === "evm"
                          ? "Paste EVM private key (0x...)"
                          : "Paste Solana private key (base58)"
                      }
                      value={localImportKey}
                      onChange={(e) => setLocalImportKey(e.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={wizardBusy}
                        onClick={() => void handleImportLocalWallet()}
                      >
                        {wizardBusy ? "Importing..." : "Import wallet"}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 font-medium text-txt-strong">Export / Recover</div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={wizardBusy}
                      onClick={() => void handleExportKeys()}
                    >
                      Export keys
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-5"
                    onClick={() => {
                      setWizardMode(null);
                      setWizardStep(1);
                    }}
                  >
                    Back
                  </Button>
                </div>
              ) : null}
              {wizardStep === 3 ? (
                <div className="mt-3 space-y-2">
                  <div className="font-medium text-txt-strong">Setup complete</div>
                  <div className="rounded-lg border border-border/30 bg-bg/15 px-3 py-2">
                    <div>EVM: {wizardAddresses?.evmAddress || "not generated"}</div>
                    <div>Solana: {wizardAddresses?.solanaAddress || "not generated"}</div>
                    <div className="mt-1">
                      Execution mode:{" "}
                      {localSignerAvailable
                        ? "can execute (local-key)"
                        : "user-sign only"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setWizardStep(2);
                    }}
                  >
                    Back to actions
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="mx-auto mt-3 grid max-w-md grid-cols-1 gap-2 text-left text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-border/30 bg-bg/15 px-2 py-1.5">
                <span className="text-muted">Cloud:</span>{" "}
                <span className={elizaCloudConnected ? "text-accent" : "text-muted"}>
                  {elizaCloudConnected ? "connected" : "not connected"}
                </span>
              </div>
              <div className="rounded-lg border border-border/30 bg-bg/15 px-2 py-1.5">
                <span className="text-muted">Privy:</span>{" "}
                <span
                  className={
                    privyConfigured === null
                      ? "text-muted"
                      : privyConfigured
                        ? "text-accent"
                        : "text-err"
                  }
                >
                  {privyConfigured === null
                    ? "unknown"
                    : privyConfigured
                      ? "configured"
                      : "not configured"}
                </span>
              </div>
              <div className="rounded-lg border border-border/30 bg-bg/15 px-2 py-1.5">
                <span className="text-muted">Local signer:</span>{" "}
                <span
                  className={
                    localSignerAvailable === null
                      ? "text-muted"
                      : localSignerAvailable
                        ? "text-accent"
                        : "text-muted"
                  }
                >
                  {localSignerAvailable === null
                    ? "unknown"
                    : localSignerAvailable
                      ? "loaded"
                      : "not loaded"}
                </span>
              </div>
            </div>
            {privyConfigured === false ? (
              <p className="mx-auto mt-2 max-w-md text-xs text-err">
                Privy wallet provisioning is not configured on this backend yet.
                Ask the operator to set PRIVY_APP_ID and PRIVY_APP_SECRET.
              </p>
            ) : null}
            {wizardNotice ? (
              <div
                className={`mx-auto mt-2 max-w-md rounded-xl border px-3 py-2 text-left text-xs ${
                  wizardNotice.tone === "error"
                    ? "border-err/30 bg-err/10 text-err"
                    : wizardNotice.tone === "success"
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-border/40 bg-bg/25 text-muted"
                }`}
              >
                {wizardNotice.text}
              </div>
            ) : null}
            {elizaCloudLoginError ? (
              <div className="mx-auto mt-3 max-w-md rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-left text-xs text-err">
                <p>{elizaCloudLoginError}</p>
                {cloudLoginHelpUrl ? (
                  <a
                    href={cloudLoginHelpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex underline"
                  >
                    Open login link
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Wallet layout ───────────────────────────────────────────────
  return (
    <div className="flex h-full w-full min-h-0 bg-bg p-0 lg:p-1">
      <div className={WALLET_SHELL_CLASS}>
        <aside className={WALLET_SIDEBAR_CLASS}>
          <div className={APP_SIDEBAR_INNER_CLASSNAME}>
            <div className={APP_SIDEBAR_HEADER_CLASSNAME}>
              <div className={WALLET_SIDEBAR_KICKER_CLASS}>Wallet</div>
              <div className={APP_SIDEBAR_META_CLASSNAME}>
                {addresses.length > 0
                  ? `${addresses.length} funding route${addresses.length === 1 ? "" : "s"} available`
                  : "Managed wallet overview"}
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-border/30 bg-bg/18 p-4 shadow-sm ring-1 ring-border/10">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/60">
                Portfolio
              </div>
              <div
                className="mt-2 text-[2rem] font-semibold leading-none text-txt-strong"
                data-testid="wallet-balance-value"
              >
                {totalUsd > 0
                  ? `$${totalUsd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "$0.00"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/75">
                <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                  {inventoryView === "tokens"
                    ? t("wallet.tokens")
                    : t("wallet.nfts")}
                </span>
                {inventoryView === "tokens" && (
                  <span className={APP_SIDEBAR_PILL_CLASSNAME}>
                    Sort: {inventorySort}
                  </span>
                )}
                {chainFocus !== "all" && (
                  <span className="rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-accent">
                    {focusedChainLabel ?? chainFocus}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className={WALLET_SIDEBAR_KICKER_CLASS}>View</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="wallet-view-tokens"
                  className={`h-10 rounded-xl border text-xs font-semibold ${
                    inventoryView === "tokens"
                      ? WALLET_SIDEBAR_ITEM_ACTIVE_CLASS
                      : "border-border/45 bg-bg/20 text-muted hover:border-border/70 hover:bg-bg/35 hover:text-txt"
                  }`}
                  onClick={() => {
                    setState("inventoryView", "tokens");
                    if (!walletBalances) void loadBalances();
                  }}
                >
                  <Coins className="h-4 w-4" />
                  {t("wallet.tokens")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="wallet-view-nfts"
                  className={`h-10 rounded-xl border text-xs font-semibold ${
                    inventoryView === "nfts"
                      ? WALLET_SIDEBAR_ITEM_ACTIVE_CLASS
                      : "border-border/45 bg-bg/20 text-muted hover:border-border/70 hover:bg-bg/35 hover:text-txt"
                  }`}
                  onClick={() => {
                    setState("inventoryView", "nfts");
                    if (!walletNfts) void loadNfts();
                  }}
                >
                  <ImageIcon className="h-4 w-4" />
                  {t("wallet.nfts")}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className={WALLET_SIDEBAR_KICKER_CLASS}>Chains</div>
              <nav className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-3">
                {chainItemMeta.map((item) => {
                  const isActive = chainFocus === item.key;
                  return (
                    <Button
                      key={item.key}
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => setState("inventoryChainFocus", item.key)}
                      aria-current={isActive ? "page" : undefined}
                      className={`${WALLET_SIDEBAR_ITEM_BASE_CLASS} ${
                        isActive
                          ? WALLET_SIDEBAR_ITEM_ACTIVE_CLASS
                          : WALLET_SIDEBAR_ITEM_INACTIVE_CLASS
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold ${
                          isActive
                            ? "border-accent/30 bg-accent/18 text-txt-strong"
                            : "border-border/50 bg-bg-accent/80 text-muted"
                        }`}
                      >
                        {item.key === "all"
                          ? "A"
                          : CHAIN_CONFIGS[item.key as ChainKey].nativeSymbol
                              .slice(0, 1)
                              .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-semibold leading-snug">
                          {item.key === "all" ? t("wallet.all") : item.label}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-muted/85">
                          {item.description}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </nav>
            </div>

            <div className="mt-4 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full justify-start rounded-xl px-4 text-xs font-semibold shadow-sm"
                onClick={() =>
                  inventoryView === "tokens" ? loadBalances() : loadNfts()
                }
              >
                <RefreshCw className="h-4 w-4" />
                {t("common.refresh")}
              </Button>
              {addresses.map((item) => (
                <Button
                  key={`${item.label}-${item.address}`}
                  variant="outline"
                  size="sm"
                  data-testid={`wallet-copy-${item.label.toLowerCase()}-address`}
                  className="h-10 w-full justify-start rounded-xl px-4 text-xs font-semibold shadow-sm"
                  onClick={() => void handleCopyAddress(item.address)}
                >
                  <Copy className="h-4 w-4" />
                  {item.label === "EVM"
                    ? t("wallet.copyEvmAddress")
                    : t("wallet.copySolanaAddress")}
                </Button>
              ))}
              {addresses.length > 0 && (
                <div
                  className="px-1 pt-1 text-[11px] leading-relaxed text-muted"
                  data-testid="wallet-address-copy-row"
                >
                  {t("wallet.receiveHint")}
                </div>
              )}
              <div className="space-y-1 pt-1">
                {addressStatusRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-lg border border-border/35 bg-bg/15 px-3 py-2"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {row.label} Address
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-txt-strong">
                      {row.address || "not generated"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto bg-bg/10">
          <div className="mx-auto max-w-[76rem] px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
            <section className={`${WALLET_PANEL_CLASS} px-5 py-5 sm:px-6`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                    Wallet
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold text-txt-strong">
                    {walletPageTitle}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                    {walletPageDescription}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Select
                    value={chainFocus}
                    onValueChange={(value) =>
                      setState("inventoryChainFocus", value)
                    }
                  >
                    <SelectTrigger
                      data-testid="wallet-chain-select"
                      aria-label={t("wallet.chain")}
                      className="h-10 min-w-32 rounded-xl border border-border/60 bg-card/88 px-3 text-sm text-txt shadow-sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("wallet.all")}</SelectItem>
                      {PRIMARY_CHAIN_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {CHAIN_CONFIGS[key].name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {inventoryView === "tokens" && (
                    <Select
                      value={inventorySort}
                      onValueChange={(nextSort) => {
                        if (
                          nextSort === "value" ||
                          nextSort === "chain" ||
                          nextSort === "symbol"
                        ) {
                          setState("inventorySort", nextSort);
                        }
                      }}
                    >
                      <SelectTrigger
                        data-testid="wallet-sort-select"
                        aria-label={t("wallet.sort")}
                        className="h-10 min-w-36 rounded-xl border border-border/60 bg-card/88 px-3 text-sm text-txt shadow-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="value">
                          {t("wallet.value")}
                        </SelectItem>
                        <SelectItem value="chain">
                          {t("wallet.chain")}
                        </SelectItem>
                        <SelectItem value="symbol">
                          {t("wallet.name")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <span className="rounded-full border border-border/45 bg-bg/25 px-3 py-1.5 text-[11px] font-semibold text-muted">
                    {chainFocus === "all" ? t("wallet.all") : focusedChainLabel}
                  </span>
                </div>
              </div>
            </section>

            <div className="mt-4 grid gap-3">
              {stewardStatus?.connected && (
                <div
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-accent/25 bg-accent/10 px-3 py-2 text-[11px] text-accent-fg shadow-sm"
                  data-testid="steward-status-badge"
                >
                  <span>🔐</span>
                  <span>Steward vault connected</span>
                  {stewardStatus.evmAddress && (
                    <span className="ml-1 font-mono text-muted">
                      {stewardStatus.evmAddress.slice(0, 6)}…
                      {stewardStatus.evmAddress.slice(-4)}
                    </span>
                  )}
                </div>
              )}

              {walletError && (
                <div className="rounded-2xl border border-danger/25 bg-danger/8 px-4 py-3 text-sm text-danger shadow-sm">
                  {walletError}
                </div>
              )}

              {inlineError?.message && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger/8 px-4 py-3 text-sm text-danger shadow-sm">
                  <span>{inlineError.message}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-danger/35 px-3 text-[11px] text-danger shadow-none hover:bg-danger/10"
                    onClick={() => void loadBalances()}
                    title={inlineError.retryTitle ?? t("common.retry")}
                  >
                    {t("common.retry")}
                  </Button>
                </div>
              )}

              <div
                className="rounded-2xl border border-border/45 bg-card/55 px-4 py-4 shadow-sm"
                data-testid="wallet-capability-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                      EVM Wallet Capability
                    </div>
                    <div className="mt-1 text-sm font-semibold text-txt-strong">
                      {capabilitySummary}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      cfg?.executionReady
                        ? "border-ok/40 bg-ok/10 text-ok"
                        : "border-border/50 bg-bg/25 text-muted"
                    }`}
                  >
                    {cfg?.executionReady ? "ready" : "blocked"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {capabilityRows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-xl border border-border/35 bg-bg/15 px-3 py-2"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {row.label}
                      </div>
                      <div className="mt-1 text-sm text-txt-strong">
                        {row.value}
                      </div>
                    </div>
                  ))}
                </div>
                {cfg?.executionBlockedReason && (
                  <div className="mt-3 rounded-xl border border-border/35 bg-bg/15 px-3 py-2 text-sm text-muted">
                    {cfg.executionBlockedReason}
                  </div>
                )}
              </div>

              {headerWarning && (
                <div className="rounded-2xl border border-accent/25 bg-accent/8 px-4 py-3 text-sm shadow-sm">
                  <div className="font-semibold text-txt-strong">
                    {headerWarning.title}
                  </div>
                  <div className="mt-1 text-muted">{headerWarning.body}</div>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2 h-auto p-0 text-[11px] font-medium text-accent"
                    onClick={goToRpcSettings}
                  >
                    {headerWarning.actionLabel}
                  </Button>
                </div>
              )}

              {chainFocus === "bsc" && evmAddr && (
                <TradePanel
                  tradeReady={tradeReady}
                  bnbBalance={bnbBalance}
                  onAddToken={handleAddToken}
                  getBscTradePreflight={getBscTradePreflight}
                  getBscTradeQuote={getBscTradeQuote}
                  executeBscTrade={executeBscTrade}
                  getBscTradeTxStatus={getBscTradeTxStatus}
                />
              )}
            </div>

            <div
              className={`mt-4 min-h-[58vh] ${WALLET_PANEL_CLASS} overflow-hidden`}
            >
              {inventoryView === "tokens" ? (
                <TokensTable
                  t={t}
                  walletLoading={walletLoading}
                  walletBalances={walletBalances}
                  visibleRows={visibleRows}
                  visibleChainErrors={visibleChainErrors}
                  inventoryChainFocus={inventoryChainFocus ?? "all"}
                  handleUntrackToken={handleUntrackToken}
                />
              ) : (
                <NftGrid
                  t={t}
                  walletNftsLoading={walletNftsLoading}
                  walletNfts={walletNfts}
                  allNfts={allNfts}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
