#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Interface } from "ethers";
import { BASE_RPC_URL } from "./antseed.js";
import { ANTSEED_WASH_TRADING_REGISTRY } from "./antseed-integrity.js";
import { rpcCall } from "./http.js";

const DEPLOYMENT_BLOCK = 50_955_026;
const EVENT_ABI = "event SellerResultUpdated(bytes32 indexed proofId,address indexed seller,uint128 previousProvenWashVolume,uint128 provenWashVolume,uint128 totalSellerVolume,bytes32 evidenceDigest,address submitter)";
const iface = new Interface([EVENT_ABI]);
const topic = iface.getEvent("SellerResultUpdated").topicHash;
const rpcUrl = process.env.BASE_RPC_URL ?? BASE_RPC_URL;
const head = Number(BigInt(await rpcCall(rpcUrl, "eth_blockNumber", [])));
const logs = [];

for (let fromBlock = DEPLOYMENT_BLOCK; fromBlock <= head; fromBlock += 2_000) {
  const toBlock = Math.min(head, fromBlock + 1_999);
  const batch = await rpcCall(rpcUrl, "eth_getLogs", [{
    address: ANTSEED_WASH_TRADING_REGISTRY,
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    topics: [topic],
  }]);
  logs.push(...batch);
}

const sellers = {};
for (const log of logs) {
  const parsed = iface.parseLog(log);
  const seller = parsed.args.seller.toLowerCase();
  const provenWashVolumeRaw = parsed.args.provenWashVolume.toString();
  const totalSellerVolumeRaw = parsed.args.totalSellerVolume.toString();
  const provenWashShareBps = parsed.args.totalSellerVolume === 0n
    ? 0
    : Number((parsed.args.provenWashVolume * 10_000n) / parsed.args.totalSellerVolume);
  sellers[seller] = {
    source: "antseed-onchain-wash-registry-snapshot",
    registryAddress: ANTSEED_WASH_TRADING_REGISTRY,
    seller,
    status: provenWashShareBps >= 2_500 ? "proven_wash_trader" : "proof_recorded_below_threshold",
    provenWashTrader: provenWashShareBps >= 2_500,
    provenWashVolumeRaw,
    provenWashVolumeUsdc: Number(provenWashVolumeRaw) / 1_000_000,
    totalSellerVolumeRaw,
    totalSellerVolumeUsdc: Number(totalSellerVolumeRaw) / 1_000_000,
    provenWashShareBps,
    provenWashShare: provenWashShareBps / 10_000,
    evidenceDigest: parsed.args.evidenceDigest,
    proofId: parsed.args.proofId,
    blockNumber: Number(BigInt(log.blockNumber)),
    transactionHash: log.transactionHash,
  };
}

const snapshot = {
  schemaVersion: "1.0.0",
  source: "antseed-onchain-wash-registry",
  registryAddress: ANTSEED_WASH_TRADING_REGISTRY,
  fromBlock: DEPLOYMENT_BLOCK,
  toBlock: head,
  updatedAt: new Date().toISOString(),
  sellerCount: Object.keys(sellers).length,
  sellers,
};
const output = resolve("./data/antseed-integrity-snapshot.json");
writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Integrity snapshot: ${output}`);
console.log(`Sellers with finalized proof results: ${snapshot.sellerCount}`);
