#!/usr/bin/env node
import { readAntseedEvidence } from "./antseed.js";
import { buildEvidenceBundle } from "./evidence.js";
import { readGhBountyEvidence } from "./ghbounty.js";
import { readWalletLinkEvidence } from "./linkage.js";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const wallet = getArg("--wallet");
const antseedAgentId = getArg("--antseed-agent-id");
if (!wallet && !antseedAgentId) {
  console.error("Usage: npm run verify -- --wallet <address> [--antseed-agent-id <id>]");
  process.exit(1);
}

const [antseed, ghbounty] = await Promise.all([
  readAntseedEvidence({
    wallet: wallet?.startsWith("0x") ? wallet : null,
    agentId: antseedAgentId == null ? undefined : Number(antseedAgentId),
  }).catch((error) => ({ source: "antseed", found: false, error: error.message, limitations: [] })),
  wallet ? readGhBountyEvidence(wallet)
    .catch((error) => ({ source: "ghbounty", found: false, error: error.message, limitations: [] }))
    : null,
]);

const linkage = wallet?.startsWith("0x") && antseed?.payments?.customers?.length
  ? await readWalletLinkEvidence(wallet, antseed.payments.customers)
    .catch((error) => ({ source: "base-blockscout", error: error.message, customers: [], limitations: [] }))
  : null;

console.log(JSON.stringify(buildEvidenceBundle({ wallet, antseed, ghbounty, linkage }), null, 2));
