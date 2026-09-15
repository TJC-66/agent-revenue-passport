import { fetchJson, rpcCall } from "./http.js";

export const ANTSEED_STATS_URL = "https://network.antseed.com/stats";
export const BASE_RPC_URL = "https://mainnet.base.org";
export const ANTSEED_STAKING_ADDRESS = "0x3652E6B22919bd322A25723B94BB207602E5c8e6";
export const ANTSEED_CHANNELS_ADDRESS = "0xBA66d3b4fbCf472F6F11D6F9F96aaCE96516F09d";

export const CHANNEL_EVENTS = {
  "0x92975c5b46f6f58de060e1da3a7256edc0f06c178ae04625cff6a4991c54c3fc": "reserved",
  "0x0b287f37d8bd14ef37f2966734ab387c243cc1a1663616a25a4cc259877736b1": "settled",
  "0xda1a99e211e09283c5837d23fe4923666d2b7f9668d585e5df5075163e010b6e": "closed",
  "0xa3b1cfd8b49ac776d2014d00266f11e7d39475cc5d11cb94387cf87369b36b79": "topped_up",
  "0xf5a36fc00a96cbb9cf1f8f59299165e1d8ffffe94396d82904b4da524d16bbce": "close_requested",
  "0xe1ab514495b26e6b7c124a620c5ce59b0ff2ed2dee7c7afa7b422a3e1e9f0c0b": "withdrawn",
};

function assertEvmAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("AntSeed wallet must be a 20-byte EVM address beginning with 0x");
  }
}

// AntseedStaking.getAgentId(address), verified against the official contract source.
export function encodeGetAgentId(address) {
  assertEvmAddress(address);
  return `0x042324b6${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export async function resolveAntseedAgentId(wallet, deps = {}) {
  const rpc = deps.rpcCall ?? rpcCall;
  const result = await rpc(deps.rpcUrl ?? BASE_RPC_URL, "eth_call", [
    {
      to: deps.stakingAddress ?? ANTSEED_STAKING_ADDRESS,
      data: encodeGetAgentId(wallet),
    },
    "latest",
  ]);
  return Number(BigInt(result));
}

function topicAddress(address) {
  assertEvmAddress(address);
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function word(data, index) {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  return BigInt(`0x${clean.slice(index * 64, (index + 1) * 64) || "0"}`);
}

// ChannelSettled appends ABI-encoded buyer-approved delivery metadata as a
// dynamic bytes field. AntSeed keeps the first four metadata words stable
// across versions, so older and newer records share one small decoder.
export function decodeSettlementMetadata(data) {
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  if (clean.length < 5 * 64) return null;
  const offsetBytes = Number(word(data, 4));
  const lengthStart = offsetBytes * 2;
  if (!Number.isSafeInteger(offsetBytes) || lengthStart + 64 > clean.length) return null;
  const byteLength = Number(BigInt(`0x${clean.slice(lengthStart, lengthStart + 64) || "0"}`));
  const payloadStart = lengthStart + 64;
  const payload = clean.slice(payloadStart, payloadStart + byteLength * 2);
  if (!Number.isSafeInteger(byteLength) || payload.length < 4 * 64) return null;
  const encoded = `0x${payload}`;
  return {
    version: Number(word(encoded, 0)),
    cumulativeInputTokens: word(encoded, 1).toString(),
    cumulativeOutputTokens: word(encoded, 2).toString(),
    cumulativeRequestCount: word(encoded, 3).toString(),
  };
}

export function decodeChannelLog(log) {
  const topics = Array.isArray(log?.topics) ? log.topics : [];
  const eventTopic = typeof topics[0] === "string" ? topics[0].toLowerCase() : "";
  const type = CHANNEL_EVENTS[eventTopic];
  if (!type || topics.slice(1, 4).some((topic) => typeof topic !== "string")) {
    return { type: undefined };
  }
  const common = {
    type,
    channelId: topics[1],
    buyer: `0x${topics[2].slice(-40)}`.toLowerCase(),
    seller: `0x${topics[3].slice(-40)}`.toLowerCase(),
    blockNumber: Number(BigInt(log.blockNumber)),
    transactionHash: log.transactionHash,
    logIndex: Number(BigInt(log.logIndex)),
  };
  if (type === "reserved") return { ...common, maxAmountRaw: word(log.data, 0).toString() };
  if (type === "settled") return {
    ...common,
    cumulativeAmountRaw: word(log.data, 0).toString(),
    deltaRaw: word(log.data, 1).toString(),
    totalSettledRaw: word(log.data, 2).toString(),
    platformFeeRaw: word(log.data, 3).toString(),
    deliveryMetadata: decodeSettlementMetadata(log.data),
  };
  if (type === "closed") return { ...common, settledAmountRaw: word(log.data, 0).toString(), refundRaw: word(log.data, 1).toString() };
  if (type === "topped_up") return { ...common, additionalAmountRaw: word(log.data, 0).toString(), newDepositRaw: word(log.data, 1).toString() };
  if (type === "withdrawn") return { ...common, refundRaw: word(log.data, 0).toString() };
  if (type === "close_requested") return { ...common, gracePeriodEnd: Number(word(log.data, 0)) };
  return common;
}

async function readBlockscoutLogs(wallet, fromBlock, toBlock, deps = {}) {
  const getJson = deps.fetchJson ?? fetchJson;
  const base = (deps.blockscoutUrl ?? "https://base.blockscout.com").replace(/\/$/, "");
  const sellerTopic = topicAddress(wallet);
  const maxRows = 1_000;
  const maxDepth = deps.blockscoutMaxDepth ?? 32;
  const delayMs = deps.blockscoutDelayMs ?? 500;
  const maxRetries = deps.blockscoutMaxRetries ?? 4;
  let lastRequestAt = 0;

  async function fetchPage(url) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const remainingDelay = delayMs - (Date.now() - lastRequestAt);
      if (remainingDelay > 0) await new Promise((resolve) => setTimeout(resolve, remainingDelay));
      lastRequestAt = Date.now();
      try {
        return await getJson(url, { timeoutMs: 60_000 });
      } catch (error) {
        if (!/429 Too Many Requests/.test(error.message) || attempt === maxRetries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1_000 * (2 ** attempt)));
      }
    }
    throw new Error("Blockscout retry loop exhausted");
  }

  async function range(start, end, depth) {
    const query = new URLSearchParams({
      module: "logs",
      action: "getLogs",
      fromBlock: String(start),
      toBlock: String(end),
      address: deps.channelsAddress ?? ANTSEED_CHANNELS_ADDRESS,
      topic3: sellerTopic,
    });
    const payload = await fetchPage(`${base}/api?${query}`);
    if (payload.status === "0" && /No logs found/i.test(payload.message ?? payload.result ?? "")) return [];
    if (payload.status !== "1" || !Array.isArray(payload.result)) {
      throw new Error(`Blockscout logs failed: ${payload.message ?? payload.result ?? "unknown response"}`);
    }
    if (payload.result.length < maxRows) return payload.result;
    if (start === end || depth >= maxDepth) {
      throw new Error(`Blockscout range ${start}-${end} reached the 1000-log cap and cannot be split safely`);
    }
    const middle = Math.floor((start + end) / 2);
    const left = await range(start, middle, depth + 1);
    const right = await range(middle + 1, end, depth + 1);
    return [...left, ...right];
  }

  return range(fromBlock, toBlock, 0);
}

export async function readAntseedPaymentEvents(wallet, activity, deps = {}) {
  if (!wallet || !activity?.lastSettledBlock) return null;
  if (!deps.rpcCall && (deps.eventSource ?? process.env.ANTSEED_EVENT_SOURCE ?? "blockscout") === "blockscout") {
    // When a durable ledger cursor is available, ask Blockscout only for the
    // contiguous range after that cursor. This preserves complete coverage
    // without turning a few days of Base blocks into hundreds of sequential
    // public-RPC calls during an interactive verification.
    const fromBlock = Math.max(
      activity.firstSettledBlock ?? 0,
      Math.min(activity.lastSettledBlock, Number(deps.resumeFromBlock ?? activity.firstSettledBlock)),
    );
    const toBlock = activity.lastSettledBlock;
    try {
      const rawLogs = await readBlockscoutLogs(wallet, fromBlock, toBlock, deps);
      return summarizePaymentEvents(rawLogs, fromBlock, toBlock, [], {
        source: "base-blockscout",
        completeHistory: fromBlock === activity.firstSettledBlock,
        successfulRanges: null,
      }, deps);
    } catch (error) {
      if (deps.disableRpcFallback) throw error;
      // Continue with the bounded public-RPC reader. This preserves useful
      // recent evidence while keeping coverage.completeHistory false.
    }
  }
  const rpc = deps.rpcCall ?? rpcCall;
  const rpcUrl = deps.archiveRpcUrl ?? process.env.BASE_ARCHIVE_RPC_URL ?? "https://base-mainnet.public.blastapi.io";
  // Public Base RPCs often reject topic-filtered archive queries. Keep the free
  // default deliberately small, then fall back to an unfiltered contract scan
  // and filter locally. A paid/archive RPC can opt into a larger window.
  const lookbackBlocks = deps.lookbackBlocks ?? Number(process.env.BASE_LOOKBACK_BLOCKS ?? 100);
  const batchSize = deps.batchSize ?? Number(process.env.BASE_LOG_BATCH_SIZE ?? 10);
  const toBlock = activity.lastSettledBlock;
  const fallbackFromBlock = toBlock - lookbackBlocks + 1;
  const resumeFromBlock = Number(deps.resumeFromBlock ?? fallbackFromBlock);
  // When a durable ledger exists, continue from its exact cursor instead of
  // scanning only a rolling tail that could leave an unverified gap.
  const fromBlock = Math.max(
    activity.firstSettledBlock ?? 0,
    Math.min(toBlock, resumeFromBlock),
  );
  const logs = [];
  const failedRanges = [];
  let successfulRanges = 0;

  for (let start = fromBlock; start <= toBlock; start += batchSize) {
    const end = Math.min(start + batchSize - 1, toBlock);
    const baseFilter = {
      address: deps.channelsAddress ?? ANTSEED_CHANNELS_ADDRESS,
      fromBlock: `0x${start.toString(16)}`,
      toBlock: `0x${end.toString(16)}`,
    };
    let batch;
    const useUnfiltered = deps.preferUnfiltered ?? rpcUrl.includes("drpc.org");
    try {
      if (useUnfiltered) throw new Error("use_unfiltered_public_rpc_fallback");
      batch = await rpc(rpcUrl, "eth_getLogs", [{
        ...baseFilter,
        topics: [Object.keys(CHANNEL_EVENTS), null, null, topicAddress(wallet)],
      }]);
    } catch (error) {
      if (deps.disableUnfilteredFallback) throw error;
      const sellerTopic = topicAddress(wallet);
      let unfiltered;
      try {
        unfiltered = await rpc(rpcUrl, "eth_getLogs", [baseFilter]);
      } catch (fallbackError) {
        if (deps.allowPartialCoverage === false) throw fallbackError;
        failedRanges.push({ fromBlock: start, toBlock: end, error: fallbackError.message });
        continue;
      }
      batch = unfiltered.filter((log) =>
        CHANNEL_EVENTS[log.topics[0]?.toLowerCase()] &&
        log.topics[3]?.toLowerCase() === sellerTopic
      );
    }
    successfulRanges += 1;
    logs.push(...batch);
  }

  if (successfulRanges === 0 && failedRanges.length > 0) {
    throw new Error(`Base event RPC returned no readable ranges (${failedRanges[0].error})`);
  }

  return summarizePaymentEvents(logs, fromBlock, toBlock, failedRanges, {
    source: "base-rpc",
    completeHistory: fromBlock === activity.firstSettledBlock && failedRanges.length === 0,
    successfulRanges,
  }, deps);
}

function summarizePaymentEvents(logs, fromBlock, toBlock, failedRanges, coverageDetails, deps = {}) {
  const events = logs.map(decodeChannelLog).sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const settlements = events.filter((event) => event.type === "settled");
  const reserveReturns = events.filter((event) => event.type === "closed" || event.type === "withdrawn");
  const customers = [...new Set(events.map((event) => event.buyer))];
  const settledRaw = settlements.reduce((sum, event) => sum + BigInt(event.deltaRaw), 0n);
  // The contract calls this field `refund`, but it is the buyer's unused
  // channel reserve returned on close/withdrawal. It is not a dispute refund.
  const unusedReserveReturnedRaw = reserveReturns.reduce((sum, event) => sum + BigInt(event.refundRaw ?? 0), 0n);
  const byCustomer = new Map();
  for (const event of settlements) {
    const current = byCustomer.get(event.buyer) ?? 0n;
    byCustomer.set(event.buyer, current + BigInt(event.deltaRaw));
  }
  const customerBreakdown = [...byCustomer.entries()]
    .map(([buyer, amount]) => ({
      buyer,
      settledRaw: amount.toString(),
      settledUsdc: Number(amount) / 1_000_000,
      share: settledRaw === 0n ? 0 : Number(amount * 1_000_000n / settledRaw) / 1_000_000,
    }))
    .sort((a, b) => b.settledUsdc - a.settledUsdc);

  return {
    chain: "base-mainnet",
    source: coverageDetails.source,
    contract: deps.channelsAddress ?? ANTSEED_CHANNELS_ADDRESS,
    coverage: {
      fromBlock,
      toBlock,
      completeHistory: coverageDetails.completeHistory,
      completeWindow: failedRanges.length === 0,
      successfulRanges: coverageDetails.successfulRanges,
      failedRanges,
    },
    customers,
    settledRaw: settledRaw.toString(),
    settledUsdc: Number(settledRaw) / 1_000_000,
    unusedReserveReturnedRaw: unusedReserveReturnedRaw.toString(),
    unusedReserveReturnedUsdc: Number(unusedReserveReturnedRaw) / 1_000_000,
    disputeRefundUsdc: null,
    largestCustomerShare: customerBreakdown[0]?.share ?? null,
    customerBreakdown,
    events,
  };
}

export async function readAntseedEvidence({ wallet, agentId }, deps = {}) {
  const resolvedAgentId = agentId ?? await resolveAntseedAgentId(wallet, deps);
  const getJson = deps.fetchJson ?? fetchJson;
  const network = await getJson(deps.statsUrl ?? ANTSEED_STATS_URL);
  const peer = network.peers.find((item) => item.onChainStats?.agentId === resolvedAgentId);

  let payments = null;
  let paymentsError = null;
  if (peer && wallet) {
    try {
      payments = await readAntseedPaymentEvents(wallet, peer.onChainStats, deps);
    } catch (error) {
      paymentsError = error.message;
    }
  }
  return {
    source: "antseed",
    sourceUrl: deps.statsUrl ?? ANTSEED_STATS_URL,
    wallet: wallet ?? null,
    agentId: resolvedAgentId,
    found: Boolean(peer),
    indexedAt: network.updatedAt,
    networkSynced: Boolean(network.indexer?.synced),
    profile: peer ? {
      peerId: peer.peerId,
      displayName: peer.displayName ?? null,
      verifications: peer.verifications ?? {},
      services: (peer.providers ?? []).flatMap((provider) => provider.services ?? []),
    } : null,
    activity: peer?.onChainStats ?? null,
    payments,
    paymentsError,
    limitations: [
      "The public aggregate endpoint exposes counts, not buyer wallet addresses or settled USDC amounts.",
      "ChannelClosed.refund is unused reserve returned to the buyer, not evidence of a dispute or service refund.",
      payments?.coverage.completeHistory
        ? "Base payment-event coverage is complete for this seller."
        : "Base payment-event coverage is a bounded recent window; totals must not be presented as lifetime income.",
      ...(paymentsError ? [`Base payment detail unavailable: ${paymentsError}`] : []),
    ],
  };
}
