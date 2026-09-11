import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ANTSEED_CHANNELS_ADDRESS,
  CHANNEL_EVENTS,
  decodeChannelLog,
} from "./antseed.js";
import { fetchJson, rpcCall } from "./http.js";

// Conservative start before the earliest settlement currently reported by
// AntSeed's public network index (44,472,648 on 2026-09-09).
export const DEFAULT_ANTSEED_START_BLOCK = 44_000_000;

function hexBlock(value) {
  return `0x${Number(value).toString(16)}`;
}

function openLedger(databasePath) {
  const absolutePath = resolve(databasePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const database = new DatabaseSync(absolutePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS antseed_events (
      transaction_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      channel_id TEXT,
      buyer TEXT,
      seller TEXT,
      delta_raw TEXT,
      cumulative_amount_raw TEXT,
      total_settled_raw TEXT,
      platform_fee_raw TEXT,
      refund_raw TEXT,
      raw_json TEXT NOT NULL,
      PRIMARY KEY (transaction_hash, log_index)
    );
    CREATE INDEX IF NOT EXISTS antseed_events_seller_idx
      ON antseed_events (seller, block_number);
    CREATE INDEX IF NOT EXISTS antseed_events_buyer_idx
      ON antseed_events (buyer, block_number);
    CREATE TABLE IF NOT EXISTS indexer_state (
      source TEXT PRIMARY KEY,
      last_scanned_block INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return database;
}

function insertEvents(database, events) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO antseed_events (
      transaction_hash, log_index, block_number, event_type, channel_id,
      buyer, seller, delta_raw, cumulative_amount_raw, total_settled_raw,
      platform_fee_raw, refund_raw, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const event of events) {
      const result = insert.run(
        event.transactionHash,
        event.logIndex,
        event.blockNumber,
        event.type,
        event.channelId ?? null,
        event.buyer ?? null,
        event.seller ?? null,
        event.deltaRaw ?? null,
        event.cumulativeAmountRaw ?? null,
        event.totalSettledRaw ?? null,
        event.platformFeeRaw ?? null,
        event.refundRaw ?? null,
        JSON.stringify(event),
      );
      inserted += Number(result.changes);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return inserted;
}

function lifecycleQuery(whereClause = "") {
  return `
    SELECT seller,
           COUNT(*) AS total_channel_count,
           SUM(has_payment) AS accepted_channel_count,
           SUM(finalized) AS completed_channel_count,
           SUM(CASE WHEN finalized = 1 AND has_payment = 1 THEN 1 ELSE 0 END) AS completed_accepted_channel_count,
           SUM(CASE WHEN finalized = 1 AND has_payment = 0 THEN 1 ELSE 0 END) AS unpaid_ended_channel_count,
           SUM(CASE WHEN withdrawn = 1 AND has_payment = 0 THEN 1 ELSE 0 END) AS timed_out_without_payment_count,
           SUM(CASE WHEN closed = 1 AND has_payment = 0 THEN 1 ELSE 0 END) AS closed_without_payment_count,
           SUM(CASE WHEN withdrawn = 1 AND has_payment = 1 THEN 1 ELSE 0 END) AS partially_accepted_then_withdrawn_count,
           SUM(CASE WHEN finalized = 0 THEN 1 ELSE 0 END) AS active_channel_count,
           SUM(close_requested) AS close_requested_channel_count,
           SUM(returned_raw) AS unused_reserve_returned_raw
    FROM (
      SELECT seller,
             channel_id,
             MAX(CASE WHEN event_type = 'settled' THEN 1 ELSE 0 END) AS has_payment,
             MAX(CASE WHEN event_type = 'closed' THEN 1 ELSE 0 END) AS closed,
             MAX(CASE WHEN event_type = 'withdrawn' THEN 1 ELSE 0 END) AS withdrawn,
             MAX(CASE WHEN event_type IN ('closed', 'withdrawn') THEN 1 ELSE 0 END) AS finalized,
             MAX(CASE WHEN event_type = 'close_requested' THEN 1 ELSE 0 END) AS close_requested,
             SUM(CASE WHEN event_type IN ('closed', 'withdrawn') THEN CAST(COALESCE(refund_raw, '0') AS INTEGER) ELSE 0 END) AS returned_raw
      FROM antseed_events
      WHERE seller IS NOT NULL AND channel_id IS NOT NULL ${whereClause}
      GROUP BY seller, channel_id
    ) AS channels
    GROUP BY seller
  `;
}

function normalizeLifecycle(row) {
  if (!row) return null;
  const completed = Number(row.completed_channel_count ?? 0);
  const accepted = Number(row.completed_accepted_channel_count ?? 0);
  const returnedRaw = String(row.unused_reserve_returned_raw ?? 0);
  return {
    totalChannelCount: Number(row.total_channel_count ?? 0),
    acceptedChannelCount: Number(row.accepted_channel_count ?? 0),
    completedChannelCount: completed,
    completedAcceptedChannelCount: accepted,
    unpaidEndedChannelCount: Number(row.unpaid_ended_channel_count ?? 0),
    timedOutWithoutPaymentCount: Number(row.timed_out_without_payment_count ?? 0),
    closedWithoutPaymentCount: Number(row.closed_without_payment_count ?? 0),
    partiallyAcceptedThenWithdrawnCount: Number(row.partially_accepted_then_withdrawn_count ?? 0),
    activeChannelCount: Number(row.active_channel_count ?? 0),
    closeRequestedChannelCount: Number(row.close_requested_channel_count ?? 0),
    buyerAcceptanceRate: completed === 0 ? null : accepted / completed,
    unusedReserveReturnedRaw: returnedRaw,
    unusedReserveReturnedUsdc: Number(returnedRaw) / 1_000_000,
  };
}

async function readBlockscoutRange(fromBlock, toBlock, options, deps, depth = 0) {
  const getJson = deps.fetchJson ?? fetchJson;
  const base = (options.blockscoutUrl ?? "https://base.blockscout.com").replace(/\/$/, "");
  const query = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    address: options.channelsAddress ?? ANTSEED_CHANNELS_ADDRESS,
  });
  let payload;
  let lastError;
  const maxRetries = Number(options.blockscoutMaxRetries ?? 4);
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      payload = await getJson(`${base}/api?${query}`, { timeoutMs: 60_000 });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!/429 Too Many Requests/.test(error.message) || attempt === maxRetries) break;
      const waitMs = Math.min(8_000, 1_000 * (2 ** attempt));
      await new Promise((resolveDelay) => setTimeout(resolveDelay, waitMs));
    }
  }
  if (lastError) {
    if (/429 Too Many Requests/.test(lastError.message)) throw lastError;
    if (fromBlock === toBlock || depth >= 32) throw lastError;
    const middle = Math.floor((fromBlock + toBlock) / 2);
    const left = await readBlockscoutRange(fromBlock, middle, options, deps, depth + 1);
    const right = await readBlockscoutRange(middle + 1, toBlock, options, deps, depth + 1);
    return [...left, ...right];
  }
  if (payload.status === "0" && /No logs found/i.test(payload.message ?? payload.result ?? "")) return [];
  if (payload.status !== "1" || !Array.isArray(payload.result)) {
    throw new Error(`Blockscout logs failed: ${payload.message ?? payload.result ?? "unknown response"}`);
  }
  if (payload.result.length < 1_000) return payload.result;
  if (fromBlock === toBlock || depth >= 32) {
    throw new Error(`Blockscout range ${fromBlock}-${toBlock} reached its 1000-log cap`);
  }
  const middle = Math.floor((fromBlock + toBlock) / 2);
  const left = await readBlockscoutRange(fromBlock, middle, options, deps, depth + 1);
  const right = await readBlockscoutRange(middle + 1, toBlock, options, deps, depth + 1);
  return [...left, ...right];
}

async function readRpcRange(rpc, rpcUrl, fromBlock, toBlock, options, depth = 0) {
  const maxRetries = Number(options.rpcMaxRetries ?? 3);
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await rpc(rpcUrl, "eth_getLogs", [{
        address: options.channelsAddress ?? ANTSEED_CHANNELS_ADDRESS,
        fromBlock: hexBlock(fromBlock),
        toBlock: hexBlock(toBlock),
        topics: [Object.keys(CHANNEL_EVENTS)],
      }]);
    } catch (error) {
      lastError = error;
      const transient = error.name === "AbortError" || /429|500|502|503|504|timeout|aborted/i.test(error.message);
      if (!transient || attempt === maxRetries) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(8_000, 1_000 * (2 ** attempt))));
    }
  }
  try {
    throw lastError;
  } catch (error) {
    const splittable = /response too large|Payload Too Large|limited to/i.test(error.message);
    if (!splittable || fromBlock === toBlock || depth >= 20) throw error;
    const middle = Math.floor((fromBlock + toBlock) / 2);
    const left = await readRpcRange(rpc, rpcUrl, fromBlock, middle, options, depth + 1);
    const right = await readRpcRange(rpc, rpcUrl, middle + 1, toBlock, options, depth + 1);
    return [...left, ...right];
  }
}

export async function syncAntseedLedger(options = {}, deps = {}) {
  const databasePath = options.databasePath ?? "./data/antseed-ledger-v2.sqlite";
  const rpcUrl = options.rpcUrl ?? process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const batchSize = Number(options.batchSize ?? 1_000);
  const maxBatches = Number(options.maxBatches ?? 1);
  const rpc = deps.rpcCall ?? rpcCall;
  const source = options.source ?? "blockscout";
  const database = deps.database ?? openLedger(databasePath);
  const ownsDatabase = !deps.database;

  try {
    const saved = database.prepare(
      "SELECT last_scanned_block FROM indexer_state WHERE source = ?",
    ).get("antseed-base-mainnet");
    const startBlock = Number(
      options.fromBlock ??
      (saved ? Number(saved.last_scanned_block) + 1 : DEFAULT_ANTSEED_START_BLOCK),
    );
    const chainHead = options.toBlock == null
      ? Number(BigInt(await rpc(rpcUrl, "eth_blockNumber", [])))
      : Number(options.toBlock);
    const requestedEnd = options.toBlock == null ? chainHead : Number(options.toBlock);
    const endBlock = Math.min(requestedEnd, chainHead);
    if (startBlock > endBlock) {
      return { ok: true, caughtUp: true, fromBlock: startBlock, toBlock: endBlock, inserted: 0, scannedBatches: 0 };
    }

    let cursor = startBlock;
    let inserted = 0;
    let scannedBatches = 0;
    const saveState = database.prepare(`
      INSERT INTO indexer_state (source, last_scanned_block, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        last_scanned_block = excluded.last_scanned_block,
        updated_at = excluded.updated_at
    `);

    while (cursor <= endBlock && scannedBatches < maxBatches) {
      const batchEnd = Math.min(cursor + batchSize - 1, endBlock);
      const logs = source === "blockscout"
        ? await readBlockscoutRange(cursor, batchEnd, options, deps)
        : await readRpcRange(rpc, rpcUrl, cursor, batchEnd, options);
      const events = logs.map(decodeChannelLog).filter((event) => event.type);
      inserted += insertEvents(database, events);
      saveState.run("antseed-base-mainnet", batchEnd, new Date().toISOString());
      cursor = batchEnd + 1;
      scannedBatches += 1;
    }

    return {
      ok: true,
      caughtUp: cursor > endBlock,
      fromBlock: startBlock,
      toBlock: cursor - 1,
      chainHead,
      inserted,
      scannedBatches,
      source,
      databasePath: resolve(databasePath),
    };
  } finally {
    if (ownsDatabase) database.close();
  }
}

export function readSellerLedger(wallet, options = {}) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new Error("Invalid Base wallet address");
  const database = openLedger(options.databasePath ?? "./data/antseed-ledger-v2.sqlite");
  try {
    const seller = wallet.toLowerCase();
    const rows = database.prepare(`
      SELECT buyer, delta_raw, block_number, transaction_hash
      FROM antseed_events
      WHERE seller = ? AND event_type = 'settled'
      ORDER BY block_number ASC, log_index ASC
    `).all(seller);
    const byCustomer = new Map();
    let settledRaw = 0n;
    for (const row of rows) {
      const amount = BigInt(row.delta_raw ?? "0");
      settledRaw += amount;
      byCustomer.set(row.buyer, (byCustomer.get(row.buyer) ?? 0n) + amount);
    }
    const customers = [...byCustomer.entries()].map(([buyer, amount]) => ({
      buyer,
      settledRaw: amount.toString(),
      settledUsdc: Number(amount) / 1_000_000,
      share: settledRaw === 0n ? 0 : Number((amount * 1_000_000n) / settledRaw) / 1_000_000,
    })).sort((a, b) => b.settledUsdc - a.settledUsdc);
    const state = database.prepare(
      "SELECT last_scanned_block, updated_at FROM indexer_state WHERE source = ?",
    ).get("antseed-base-mainnet");
    const lifecycle = normalizeLifecycle(
      database.prepare(lifecycleQuery("AND seller = ?")).get(seller),
    );
    return {
      seller,
      settlementCount: rows.length,
      customerCount: customers.length,
      settledRaw: settledRaw.toString(),
      settledUsdc: Number(settledRaw) / 1_000_000,
      largestCustomerShare: customers[0]?.share ?? null,
      firstSettledBlock: rows[0]?.block_number ?? null,
      lastSettledBlock: rows.at(-1)?.block_number ?? null,
      customers,
      lifecycle,
      ledgerCoverage: state ?? null,
    };
  } finally {
    database.close();
  }
}

export function exportLedgerSnapshot(options = {}) {
  const database = openLedger(options.databasePath ?? "./data/antseed-ledger-v2.sqlite");
  try {
    const state = database.prepare(
      "SELECT last_scanned_block, updated_at FROM indexer_state WHERE source = ?",
    ).get("antseed-base-mainnet") ?? null;
    const rows = database.prepare(`
      SELECT seller, buyer,
             COUNT(*) AS settlement_count,
             SUM(CAST(delta_raw AS INTEGER)) AS settled_raw,
             MIN(block_number) AS first_settled_block,
             MAX(block_number) AS last_settled_block
      FROM antseed_events
      WHERE event_type = 'settled'
      GROUP BY seller, buyer
      ORDER BY seller, settled_raw DESC
    `).all();
    const lifecycleRows = database.prepare(lifecycleQuery()).all();
    const lifecycleBySeller = new Map(
      lifecycleRows.map((row) => [row.seller, normalizeLifecycle(row)]),
    );
    const sellers = {};
    for (const row of rows) {
      const seller = row.seller;
      const entry = sellers[seller] ??= {
        settlementCount: 0,
        settledRaw: "0",
        firstSettledBlock: null,
        lastSettledBlock: null,
        customers: [],
      };
      entry.settlementCount += Number(row.settlement_count);
      entry.settledRaw = (BigInt(entry.settledRaw) + BigInt(row.settled_raw ?? 0)).toString();
      entry.firstSettledBlock = entry.firstSettledBlock == null
        ? Number(row.first_settled_block)
        : Math.min(entry.firstSettledBlock, Number(row.first_settled_block));
      entry.lastSettledBlock = entry.lastSettledBlock == null
        ? Number(row.last_settled_block)
        : Math.max(entry.lastSettledBlock, Number(row.last_settled_block));
      entry.customers.push({
        buyer: row.buyer,
        settlementCount: Number(row.settlement_count),
        settledRaw: String(row.settled_raw ?? 0),
      });
    }
    for (const entry of Object.values(sellers)) {
      const total = BigInt(entry.settledRaw);
      entry.settledUsdc = Number(total) / 1_000_000;
      entry.customerCount = entry.customers.length;
      for (const customer of entry.customers) {
        const amount = BigInt(customer.settledRaw);
        customer.settledUsdc = Number(amount) / 1_000_000;
        customer.share = total === 0n ? 0 : Number((amount * 1_000_000n) / total) / 1_000_000;
      }
      entry.largestCustomerShare = entry.customers[0]?.share ?? null;
    }
    for (const [seller, lifecycle] of lifecycleBySeller) {
      const entry = sellers[seller] ??= {
        settlementCount: 0,
        settledRaw: "0",
        settledUsdc: 0,
        customerCount: 0,
        largestCustomerShare: null,
        firstSettledBlock: null,
        lastSettledBlock: null,
        customers: [],
      };
      entry.lifecycle = lifecycle;
    }
    return {
      schemaVersion: "1.1.0",
      generatedAt: new Date().toISOString(),
      coverage: {
        fromBlock: DEFAULT_ANTSEED_START_BLOCK,
        toBlock: Number(state?.last_scanned_block ?? 0),
        updatedAt: state?.updated_at ?? null,
      },
      sellers,
    };
  } finally {
    database.close();
  }
}
