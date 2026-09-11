import { fetchJson } from "./http.js";

export const BASE_BLOCKSCOUT_URL = "https://base.blockscout.com";
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function addressOf(side) {
  return lower(side?.hash);
}

function incomingNativeFunders(items, wallet) {
  return items
    .filter((tx) => addressOf(tx.to) === wallet && addressOf(tx.from) !== wallet && !tx.from?.is_contract && BigInt(tx.value ?? 0) > 0n)
    .map((tx) => ({ wallet: addressOf(tx.from), txHash: tx.hash, valueWei: tx.value, timestamp: tx.timestamp }));
}

function incomingUsdcFunders(items, wallet) {
  return items
    .filter((transfer) =>
      lower(transfer.token?.address_hash) === USDC_BASE &&
      addressOf(transfer.to) === wallet &&
      addressOf(transfer.from) !== wallet &&
      !transfer.from?.is_contract
    )
    .map((transfer) => ({
      wallet: addressOf(transfer.from),
      txHash: transfer.transaction_hash,
      amountRaw: transfer.total?.value ?? "0",
      decimals: Number(transfer.total?.decimals ?? 6),
      timestamp: transfer.timestamp,
    }));
}

function createExplorerReader(deps) {
  const getJson = deps.fetchJson ?? fetchJson;
  const base = (deps.blockscoutUrl ?? BASE_BLOCKSCOUT_URL).replace(/\/$/, "");
  const delayMs = deps.blockscoutDelayMs ?? 350;
  const maxRetries = deps.blockscoutMaxRetries ?? 3;
  let lastRequestAt = 0;

  async function get(url) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const wait = delayMs - (Date.now() - lastRequestAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
      try {
        return await getJson(url, { timeoutMs: 30_000 });
      } catch (error) {
        const transient = /429|500|502|503|504|timeout|aborted|temporarily unavailable/i.test(error.message);
        if (!transient || attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1_000 * (2 ** attempt)));
      }
    }
    throw new Error("Blockscout retry loop exhausted");
  }

  async function pages(path, initialQuery = {}) {
    const items = [];
    let query = { ...initialQuery };
    let truncated = false;
    const maxPages = deps.maxPagesPerWallet ?? 3;
    for (let page = 0; page < maxPages; page += 1) {
      const search = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
      const payload = await get(`${base}${path}${search.size ? `?${search}` : ""}`);
      items.push(...(payload.items ?? []));
      if (!payload.next_page_params) return { items, truncated: false };
      query = { ...initialQuery, ...payload.next_page_params };
      truncated = true;
    }
    return { items, truncated };
  }
  return { pages };
}

async function recentActivity(wallet, deps, reader) {
  const [transactionsResult, tokenTransfersResult] = await Promise.allSettled([
    reader.pages(`/api/v2/addresses/${wallet}/transactions`),
    reader.pages(`/api/v2/addresses/${wallet}/token-transfers`, { type: "ERC-20" }),
  ]);
  const transactions = transactionsResult.status === "fulfilled"
    ? transactionsResult.value
    : { items: [], truncated: true };
  const tokenTransfers = tokenTransfersResult.status === "fulfilled"
    ? tokenTransfersResult.value
    : { items: [], truncated: true };
  return {
    transactions: transactions.items,
    tokenTransfers: tokenTransfers.items,
    truncated: transactions.truncated || tokenTransfers.truncated,
    errors: [
      ...(transactionsResult.status === "rejected" ? [`native transactions: ${transactionsResult.reason?.message ?? "unavailable"}`] : []),
      ...(tokenTransfersResult.status === "rejected" ? [`token transfers: ${tokenTransfersResult.reason?.message ?? "unavailable"}`] : []),
    ],
  };
}

function directEvidence(agentWallet, customerWallet, agent, customer) {
  const native = [...agent.transactions, ...customer.transactions]
    .filter((tx) => {
      const from = addressOf(tx.from);
      const to = addressOf(tx.to);
      return ((from === agentWallet && to === customerWallet) || (from === customerWallet && to === agentWallet)) && BigInt(tx.value ?? 0) > 0n;
    })
    .map((tx) => ({ txHash: tx.hash, from: addressOf(tx.from), to: addressOf(tx.to), valueWei: tx.value, timestamp: tx.timestamp }));
  const usdc = [...agent.tokenTransfers, ...customer.tokenTransfers]
    .filter((transfer) => {
      const from = addressOf(transfer.from);
      const to = addressOf(transfer.to);
      return lower(transfer.token?.address_hash) === USDC_BASE &&
        ((from === agentWallet && to === customerWallet) || (from === customerWallet && to === agentWallet));
    })
    .map((transfer) => ({
      txHash: transfer.transaction_hash,
      from: addressOf(transfer.from),
      to: addressOf(transfer.to),
      amountRaw: transfer.total?.value ?? "0",
      decimals: Number(transfer.total?.decimals ?? 6),
      timestamp: transfer.timestamp,
    }));
  return { native, usdc };
}

function commonFunders(agentFunders, customerFunders) {
  const customerSet = new Set(customerFunders.map((item) => item.wallet));
  return [...new Set(agentFunders.map((item) => item.wallet).filter((wallet) => customerSet.has(wallet)))];
}

export async function readWalletLinkEvidence(agentWallet, customerWallets, deps = {}) {
  const agentAddress = lower(agentWallet);
  const uniqueCustomers = [...new Set(customerWallets.map(lower).filter(Boolean))].slice(0, deps.maxCustomers ?? 5);
  const reader = createExplorerReader(deps);
  const agent = await recentActivity(agentAddress, deps, reader);
  const customers = [];
  for (const customerWallet of uniqueCustomers) {
    const customer = await recentActivity(customerWallet, deps, reader);
    const directTransfers = directEvidence(agentAddress, customerWallet, agent, customer);
    const commonNativeFunders = commonFunders(
      incomingNativeFunders(agent.transactions, agentAddress),
      incomingNativeFunders(customer.transactions, customerWallet),
    );
    const commonUsdcFunders = commonFunders(
      incomingUsdcFunders(agent.tokenTransfers, agentAddress),
      incomingUsdcFunders(customer.tokenTransfers, customerWallet),
    );
    const indicators = [
      ...(directTransfers.native.length || directTransfers.usdc.length ? ["direct_value_transfer"] : []),
      ...(commonNativeFunders.length ? ["shared_native_funder"] : []),
      ...(commonUsdcFunders.length ? ["shared_usdc_funder"] : []),
    ];
    customers.push({
      customerWallet,
      indicators,
      directTransfers,
      commonNativeFunders,
      commonUsdcFunders,
      recentHistoryTruncated: agent.truncated || customer.truncated,
      lookupErrors: [...agent.errors, ...customer.errors],
      interpretation: indicators.length
        ? "Linkage indicators exist, but they are clues rather than proof that both wallets share an owner."
        : agent.errors.length || customer.errors.length
        ? "No linkage indicator was found in the records that could be read, but part of the Blockscout lookup failed. No independence claim can be made."
        : "No linkage indicator was found in the inspected recent Blockscout pages; this does not prove independence.",
    });
  }
  return {
    source: "base-blockscout",
    sourceUrl: deps.blockscoutUrl ?? BASE_BLOCKSCOUT_URL,
    agentWallet: agentAddress,
    customers,
    limitations: [
      `At most ${deps.maxPagesPerWallet ?? 3} recent Blockscout pages are inspected per activity type for each wallet.`,
      "A direct transfer or common funder is an ownership clue, not conclusive proof of self-payment.",
      "Shared contracts, exchanges, bridges, relayers, and payment routers must not be treated as common wallet owners.",
    ],
  };
}
