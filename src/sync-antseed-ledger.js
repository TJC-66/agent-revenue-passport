#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exportLedgerSnapshot, syncAntseedLedger } from "./antseed-ledger.js";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const result = await syncAntseedLedger({
  databasePath: arg("--database", "./data/antseed-ledger-v2.sqlite"),
  rpcUrl: arg("--rpc", process.env.BASE_RPC_URL),
  source: arg("--source", "blockscout"),
  blockscoutUrl: arg("--blockscout", "https://base.blockscout.com"),
  fromBlock: arg("--from"),
  toBlock: arg("--to"),
  batchSize: Number(arg("--batch-size", "1000")),
  maxBatches: Number(arg("--max-batches", "1")),
});

console.log(JSON.stringify(result, null, 2));
const snapshotPath = resolve("./data/antseed-ledger-snapshot.json");
writeFileSync(snapshotPath, `${JSON.stringify(exportLedgerSnapshot({ databasePath: result.databasePath }), null, 2)}\n`);
console.log(`Snapshot: ${snapshotPath}`);
