import { fetchJson } from "./http.js";
import { rpcCall } from "./http.js";

export const GHB_SUPABASE_URL = "https://kzltawaqgiwoyxxcdofm.supabase.co";
// This is the public browser key shipped by ghbounty.com, not a secret/service-role key.
export const GHB_PUBLISHABLE_KEY = "sb_publishable_VoJ2_50y9BZRtmo7QmHJPQ_MgjPMNFh";
export const SOLANA_RPCS = {
  "solana-devnet": "https://api.devnet.solana.com",
  "solana-mainnet": "https://api.mainnet-beta.solana.com",
};

export async function verifySolanaTransaction(record, deps = {}) {
  if (!record.tx_hash || !record.chain_id) return { verified: false, reason: "missing_transaction_reference" };
  const rpcUrl = (deps.solanaRpcs ?? SOLANA_RPCS)[record.chain_id];
  if (!rpcUrl) return { verified: false, reason: "unsupported_chain", chainId: record.chain_id };
  const rpc = deps.rpcCall ?? rpcCall;
  const transaction = await rpc(rpcUrl, "getTransaction", [record.tx_hash, {
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0,
  }]);
  if (!transaction) return { verified: false, reason: "transaction_not_found", chainId: record.chain_id, txHash: record.tx_hash };
  const keys = transaction.transaction.message.accountKeys.map((key) => typeof key === "string" ? key : key.pubkey);
  const solverIndex = keys.indexOf(record.solver);
  const balanceDeltaLamports = solverIndex === -1
    ? null
    : transaction.meta.postBalances[solverIndex] - transaction.meta.preBalances[solverIndex];
  return {
    verified: transaction.meta.err == null && solverIndex !== -1,
    chainId: record.chain_id,
    txHash: record.tx_hash,
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    successful: transaction.meta.err == null,
    solverPresent: solverIndex !== -1,
    solverBalanceDeltaLamports: balanceDeltaLamports,
    explorerUrl: record.chain_id === "solana-mainnet"
      ? `https://solscan.io/tx/${record.tx_hash}`
      : `https://solscan.io/tx/${record.tx_hash}?cluster=devnet`,
  };
}

function restUrl(baseUrl, table, query) {
  return `${baseUrl}/rest/v1/${table}?${new URLSearchParams(query)}`;
}

export async function readGhBountyEvidence(wallet, deps = {}) {
  if (!wallet) throw new Error("GH Bounty wallet is required");
  const getJson = deps.fetchJson ?? fetchJson;
  const baseUrl = deps.baseUrl ?? GHB_SUPABASE_URL;
  const headers = { apikey: deps.publishableKey ?? GHB_PUBLISHABLE_KEY };

  const [profiles, submissions, wonIssues] = await Promise.all([
    getJson(restUrl(baseUrl, "profiles", {
      select: "user_id,github_handle,role,wallet_pubkey",
      wallet_pubkey: `eq.${wallet}`,
    }), { headers }),
    getJson(restUrl(baseUrl, "submissions", {
      select: "id,issue_pda,solver,state,rank,pr_url,tx_hash,chain_id,created_at,scored_at",
      solver: `eq.${wallet}`,
      order: "created_at.desc",
    }), { headers }),
    getJson(restUrl(baseUrl, "issues", {
      select: "id,pda,amount,mint,creator,winner,state,github_issue_url,submission_count,chain_id,created_at",
      winner: `eq.${wallet}`,
      order: "created_at.desc",
    }), { headers }),
  ]);

  const issueIds = [...new Set([...submissions.map((s) => s.issue_pda), ...wonIssues.map((i) => i.pda)].filter(Boolean))];
  const relatedIssues = issueIds.length === 0 ? [] : await getJson(restUrl(baseUrl, "issues", {
    select: "id,pda,amount,mint,creator,winner,state,github_issue_url,submission_count,chain_id,created_at",
    pda: `in.(${issueIds.join(",")})`,
  }), { headers });
  const transactionChecks = await Promise.all(submissions
    .filter((submission) => submission.tx_hash)
    .map((submission) => verifySolanaTransaction(submission, deps)
      .catch((error) => ({ verified: false, reason: "rpc_error", error: error.message, txHash: submission.tx_hash }))));

  return {
    source: "ghbounty",
    sourceUrl: baseUrl,
    wallet,
    found: profiles.length > 0 || submissions.length > 0 || wonIssues.length > 0,
    profile: profiles[0] ?? null,
    submissions,
    wonIssues,
    relatedIssues,
    transactionChecks,
    activity: {
      submissionCount: submissions.length,
      winCount: wonIssues.length,
      approvedOrScoredCount: submissions.filter((s) => s.scored_at || s.rank != null).length,
      recordedBountyAmount: wonIssues.reduce((sum, issue) => sum + Number(issue.amount ?? 0), 0),
      verifiedSubmissionTransactions: transactionChecks.filter((check) => check.verified).length,
    },
    limitations: [
      "Bounty amounts retain their on-chain integer denomination and must be normalized using the mint decimals.",
      "Submission transaction hashes prove on-chain submission activity, not payout by themselves.",
      "Current public records may be on Solana Devnet; Devnet amounts must never be presented as real income.",
    ],
  };
}
