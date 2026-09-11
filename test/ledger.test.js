import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncAntseedLedger, readSellerLedger } from "../src/antseed-ledger.js";

const SETTLED = "0x0b287f37d8bd14ef37f2966734ab387c243cc1a1663616a25a4cc259877736b1";
const RESERVED = "0x92975c5b46f6f58de060e1da3a7256edc0f06c178ae04625cff6a4991c54c3fc";
const CLOSED = "0xda1a99e211e09283c5837d23fe4923666d2b7f9668d585e5df5075163e010b6e";
const CLOSE_REQUESTED = "0xf5a36fc00a96cbb9cf1f8f59299165e1d8ffffe94396d82904b4da524d16bbce";
const WITHDRAWN = "0xe1ab514495b26e6b7c124a620c5ce59b0ff2ed2dee7c7afa7b422a3e1e9f0c0b";
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const topicAddress = (suffix) => `0x${suffix.padStart(64, "0")}`;

test("indexes AntSeed settlement logs idempotently and aggregates a seller", async () => {
  const directory = mkdtempSync(join(tmpdir(), "agentproof-ledger-"));
  const databasePath = join(directory, "ledger.sqlite");
  const seller = "0x000000000000000000000000000000000000dead";
  const log = {
    topics: [SETTLED, topicAddress("1"), topicAddress("beef"), topicAddress("dead")],
    data: `0x${word(2_000_000)}${word(2_000_000)}${word(2_000_000)}${word(40_000)}`,
    blockNumber: "0x64",
    logIndex: "0x0",
    transactionHash: "0xabc",
  };
  const rpcCall = async (_url, method) => method === "eth_blockNumber" ? "0x64" : [log];

  try {
    const first = await syncAntseedLedger({ databasePath, fromBlock: 100, toBlock: 100, source: "rpc" }, { rpcCall });
    const second = await syncAntseedLedger({ databasePath, fromBlock: 100, toBlock: 100, source: "rpc" }, { rpcCall });
    const summary = readSellerLedger(seller, { databasePath });
    assert.equal(first.inserted, 1);
    assert.equal(second.inserted, 0);
    assert.equal(summary.settlementCount, 1);
    assert.equal(summary.customerCount, 1);
    assert.equal(summary.settledUsdc, 2);
    assert.equal(summary.largestCustomerShare, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ignores incomplete Blockscout logs instead of aborting the ledger refresh", async () => {
  const directory = mkdtempSync(join(tmpdir(), "agentproof-ledger-invalid-"));
  const databasePath = join(directory, "ledger.sqlite");
  const incompleteLog = {
    topics: [SETTLED, topicAddress("1"), null, topicAddress("dead")],
    data: `0x${word(2_000_000)}${word(2_000_000)}${word(2_000_000)}${word(40_000)}`,
    blockNumber: "0x64",
    logIndex: "0x0",
    transactionHash: "0xincomplete",
  };
  const rpcCall = async (_url, method) => method === "eth_blockNumber" ? "0x64" : [incompleteLog];

  try {
    const result = await syncAntseedLedger({ databasePath, fromBlock: 100, toBlock: 100, source: "rpc" }, { rpcCall });
    assert.equal(result.inserted, 0);
    assert.equal(result.caughtUp, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("classifies buyer-approved, unpaid-ended, and active channels", async () => {
  const directory = mkdtempSync(join(tmpdir(), "agentproof-lifecycle-"));
  const databasePath = join(directory, "ledger.sqlite");
  const seller = "0x000000000000000000000000000000000000dead";
  const log = (event, channel, buyer, data, block, index) => ({
    topics: [event, topicAddress(String(channel)), topicAddress(buyer), topicAddress("dead")],
    data,
    blockNumber: `0x${block.toString(16)}`,
    logIndex: `0x${index.toString(16)}`,
    transactionHash: `0x${block.toString(16)}${index}`,
  });
  const logs = [
    log(RESERVED, 1, "beef", `0x${word(2_000_000)}`, 100, 0),
    log(SETTLED, 1, "beef", `0x${word(1_000_000)}${word(1_000_000)}${word(1_000_000)}${word(20_000)}`, 101, 0),
    log(CLOSED, 1, "beef", `0x${word(1_000_000)}${word(1_000_000)}`, 102, 0),
    log(RESERVED, 2, "cafe", `0x${word(1_000_000)}`, 103, 0),
    log(CLOSE_REQUESTED, 2, "cafe", `0x${word(999_999)}`, 104, 0),
    log(WITHDRAWN, 2, "cafe", `0x${word(1_000_000)}`, 105, 0),
    log(RESERVED, 3, "f00d", `0x${word(1_000_000)}`, 106, 0),
  ];
  const rpcCall = async (_url, method) => method === "eth_blockNumber" ? "0x6a" : logs;

  try {
    await syncAntseedLedger({ databasePath, fromBlock: 100, toBlock: 106, source: "rpc" }, { rpcCall });
    const summary = readSellerLedger(seller, { databasePath });
    assert.equal(summary.lifecycle.totalChannelCount, 3);
    assert.equal(summary.lifecycle.acceptedChannelCount, 1);
    assert.equal(summary.lifecycle.completedChannelCount, 2);
    assert.equal(summary.lifecycle.completedAcceptedChannelCount, 1);
    assert.equal(summary.lifecycle.unpaidEndedChannelCount, 1);
    assert.equal(summary.lifecycle.timedOutWithoutPaymentCount, 1);
    assert.equal(summary.lifecycle.activeChannelCount, 1);
    assert.equal(summary.lifecycle.buyerAcceptanceRate, 0.5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
