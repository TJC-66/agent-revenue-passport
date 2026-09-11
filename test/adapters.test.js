import assert from "node:assert/strict";
import test from "node:test";
import { decodeChannelLog, encodeGetAgentId, readAntseedEvidence, readAntseedPaymentEvents } from "../src/antseed.js";
import { buildEvidenceBundle, buildGenLayerInput } from "../src/evidence.js";
import { buildPreliminaryAssessment } from "../src/assessment.js";
import { readGhBountyEvidence, verifySolanaTransaction } from "../src/ghbounty.js";
import { readWalletLinkEvidence } from "../src/linkage.js";
import { readAntseedIntegrityStatus } from "../src/antseed-integrity.js";

test("encodes AntSeed getAgentId(address) calldata", () => {
  const data = encodeGetAgentId("0x000000000000000000000000000000000000dEaD");
  assert.equal(data, `0x042324b6${"dead".padStart(64, "0")}`);
});

test("normalizes AntSeed network stats", async () => {
  const evidence = await readAntseedEvidence({ agentId: 42 }, {
    fetchJson: async () => ({
      updatedAt: "2026-09-08T00:00:00Z",
      indexer: { synced: true },
      peers: [{ peerId: "peer-1", displayName: "Agent", providers: [], onChainStats: { agentId: 42, totalRequests: "12", uniqueBuyers: 3 } }],
    }),
  });
  assert.equal(evidence.found, true);
  assert.equal(evidence.activity.totalRequests, "12");
});

test("reads AntSeed's finalized onchain wash-trading status", async () => {
  const outputs = {
    "0x1f475040": "0x1",
    "0x34247003": "0x0f4240",
    "0xbcf0f540": "0x3d0900",
    "0xf56dcb30": "0x09c4",
    "0xc34b9b8e": `0x${"ab".repeat(32)}`,
  };
  const result = await readAntseedIntegrityStatus("0x000000000000000000000000000000000000dead", {
    rpcCall: async (_url, _method, params) => outputs[params[0].data.slice(0, 10)],
  });
  assert.equal(result.provenWashTrader, true);
  assert.equal(result.provenWashVolumeUsdc, 1);
  assert.equal(result.totalSellerVolumeUsdc, 4);
  assert.equal(result.provenWashShare, 0.25);
  assert.match(result.evidenceDigest, /^0xabab/);
});

test("reads GH Bounty public records without selecting private fields", async () => {
  const calls = [];
  const evidence = await readGhBountyEvidence("wallet-1", {
    fetchJson: async (url) => {
      calls.push(url);
      if (url.includes("/profiles?")) return [{ user_id: "u1", wallet_pubkey: "wallet-1" }];
      if (url.includes("/submissions?")) return [{ id: "s1", issue_pda: "pda-1", solver: "wallet-1", rank: 1 }];
      if (url.includes("winner=eq.wallet-1")) return [{ id: "i1", pda: "pda-1", amount: 100, winner: "wallet-1" }];
      if (url.includes("pda=in.%28pda-1%29")) return [{ id: "i1", pda: "pda-1", amount: 100 }];
      return [];
    },
  });
  assert.equal(evidence.activity.winCount, 1);
  assert.equal(evidence.activity.recordedBountyAmount, 100);
  assert.ok(calls.every((url) => !url.includes("email")));
});

test("builds a versioned evidence bundle and does not overclaim readiness", () => {
  const bundle = buildEvidenceBundle({
    wallet: "wallet-1",
    antseed: { source: "antseed", sourceUrl: "a", found: true, activity: { totalRequests: "5", settlementCount: 2, uniqueBuyers: 1 } },
    ghbounty: { source: "ghbounty", sourceUrl: "g", found: false, activity: {} },
  });
  assert.equal(bundle.objectiveMetrics.antseedRequests, 5);
  assert.equal(bundle.readiness.canAssessPaymentFlows, false);
  assert.equal(bundle.readiness.canRunGenLayerJudgment, false);
  assert.match(bundle.genLayerReportId, /^air-[0-9a-f]{64}$/);
});

test("decodes recent AntSeed settlement evidence", async () => {
  const seller = "0x000000000000000000000000000000000000dead";
  const buyerTopic = `0x${"beef".padStart(64, "0")}`;
  const sellerTopic = `0x${"dead".padStart(64, "0")}`;
  const encodeWords = (...values) => `0x${values.map((value) => BigInt(value).toString(16).padStart(64, "0")).join("")}`;
  const payments = await readAntseedPaymentEvents(seller, { firstSettledBlock: 100, lastSettledBlock: 100 }, {
    rpcCall: async () => [{
      topics: ["0x0b287f37d8bd14ef37f2966734ab387c243cc1a1663616a25a4cc259877736b1", `0x${"1".padStart(64, "0")}`, buyerTopic, sellerTopic],
      data: encodeWords(1_000_000, 1_000_000, 1_000_000, 20_000),
      blockNumber: "0x64",
      logIndex: "0x0",
      transactionHash: "0xtx",
    }],
  });
  assert.equal(payments.settledUsdc, 1);
  assert.equal(payments.customers[0], "0x000000000000000000000000000000000000beef");
  assert.equal(payments.largestCustomerShare, 1);
  assert.equal(payments.customerBreakdown[0].settledUsdc, 1);
  assert.equal(payments.unusedReserveReturnedUsdc, 0);
  assert.equal(payments.disputeRefundUsdc, null);
  assert.equal(payments.coverage.completeHistory, true);
});

test("decodes buyer-approved delivery counters from ChannelSettled metadata", () => {
  const encodeWords = (...values) => `0x${values.map((value) => BigInt(value).toString(16).padStart(64, "0")).join("")}`;
  const event = decodeChannelLog({
    topics: [
      "0x0b287f37d8bd14ef37f2966734ab387c243cc1a1663616a25a4cc259877736b1",
      `0x${"1".padStart(64, "0")}`,
      `0x${"beef".padStart(64, "0")}`,
      `0x${"dead".padStart(64, "0")}`,
    ],
    // Four settlement fields, offset to bytes, byte length, then metadata v1.
    data: encodeWords(1_000_000, 1_000_000, 1_000_000, 20_000, 160, 128, 1, 10, 20, 2),
    blockNumber: "0x64",
    logIndex: "0x0",
    transactionHash: "0xmeta",
  });
  assert.deepEqual(event.deliveryMetadata, {
    version: 1,
    cumulativeInputTokens: "10",
    cumulativeOutputTokens: "20",
    cumulativeRequestCount: "2",
  });
});

test("continues AntSeed event reads from the durable ledger cursor", async () => {
  const seller = "0x000000000000000000000000000000000000dead";
  let inspectedFilter;
  await readAntseedPaymentEvents(seller, { firstSettledBlock: 100, lastSettledBlock: 250 }, {
    resumeFromBlock: 201,
    batchSize: 100,
    rpcCall: async (_url, _method, params) => {
      inspectedFilter = params[0];
      return [];
    },
  });
  assert.equal(inspectedFilter.fromBlock, "0xc9");
  assert.equal(inspectedFilter.toBlock, "0xfa");
});

test("verifies a Solana record on its declared chain", async () => {
  const result = await verifySolanaTransaction({ tx_hash: "sig", chain_id: "solana-devnet", solver: "solver" }, {
    rpcCall: async (url) => {
      assert.match(url, /devnet/);
      return {
        slot: 1,
        blockTime: 2,
        transaction: { message: { accountKeys: [{ pubkey: "payer" }, { pubkey: "solver" }] } },
        meta: { err: null, preBalances: [100, 10], postBalances: [90, 20] },
      };
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.solverBalanceDeltaLamports, 10);
});

test("does not accuse self-payment without wallet-link evidence", () => {
  const assessment = buildPreliminaryAssessment({
    wallet: "0xagent",
    antseed: { payments: { coverage: { completeWindow: true, completeHistory: true }, settledUsdc: 100, events: [{ type: "settled" }], customerBreakdown: [{ buyer: "0xbuyer", share: 0.9, settledUsdc: 90 }] } },
    ghbounty: null,
  });
  assert.equal(assessment.status, "preliminary");
  assert.equal(assessment.fraudOrSelfPaymentRisk, "not_scored");
  assert.equal(assessment.reasons[0].severity, "high");
});

test("builds a compact GenLayer input without raw submission payloads", () => {
  const input = buildGenLayerInput({
    wallet: "wallet",
    antseed: { found: true, activity: { totalRequests: "2" } },
    ghbounty: { found: true, activity: { submissionCount: 1 }, submissions: [{ pr_url: "untrusted" }] },
  });
  assert.equal(input.antseed.requests, 2);
  assert.equal(input.ghbounty.submissions, 1);
  assert.equal(JSON.stringify(input).includes("untrusted"), false);
});

test("finds a shared native funder but labels it as a clue", async () => {
  const responses = new Map([
    ["0xagent/transactions", { items: [{ hash: "a", value: "10", from: { hash: "0xfunder", is_contract: false }, to: { hash: "0xagent" } }] }],
    ["0xagent/token-transfers?type=ERC-20", { items: [] }],
    ["0xcustomer/transactions", { items: [{ hash: "b", value: "20", from: { hash: "0xfunder", is_contract: false }, to: { hash: "0xcustomer" } }] }],
    ["0xcustomer/token-transfers?type=ERC-20", { items: [] }],
  ]);
  const evidence = await readWalletLinkEvidence("0xagent", ["0xcustomer"], {
    blockscoutDelayMs: 0,
    fetchJson: async (url) => {
      const key = [...responses.keys()].find((candidate) => url.includes(candidate));
      return responses.get(key);
    },
  });
  assert.deepEqual(evidence.customers[0].commonNativeFunders, ["0xfunder"]);
  assert.match(evidence.customers[0].interpretation, /clues rather than proof/);
});
