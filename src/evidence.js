import { buildPreliminaryAssessment } from "./assessment.js";
import { createHash } from "node:crypto";

export function buildGenLayerInput({ wallet, antseed, ghbounty, linkage }) {
  const payments = antseed?.payments;
  return {
    schemaVersion: "0.1.0",
    subjectWallet: wallet,
    antseed: {
      found: Boolean(antseed?.found),
      requests: Number(antseed?.activity?.totalRequests ?? 0),
      settlements: Number(antseed?.activity?.settlementCount ?? 0),
      reportedUniqueBuyers: Number(antseed?.activity?.uniqueBuyers ?? 0),
      inspectedWindow: payments?.coverage ?? null,
      settledUsdcInWindow: payments?.settledUsdc ?? null,
      unusedReserveReturnedUsdcInWindow: payments?.unusedReserveReturnedUsdc ?? null,
      disputeRefundUsdcInWindow: payments?.disputeRefundUsdc ?? null,
      largestCustomerShare: payments?.largestCustomerShare ?? null,
      topCustomers: (payments?.customerBreakdown ?? []).slice(0, 8),
      dataError: antseed?.paymentsError ?? antseed?.error ?? null,
    },
    ghbounty: {
      found: Boolean(ghbounty?.found),
      submissions: ghbounty?.activity?.submissionCount ?? 0,
      wins: ghbounty?.activity?.winCount ?? 0,
      recordedBountyAmountRaw: ghbounty?.activity?.recordedBountyAmount ?? 0,
      verifiedTransactions: (ghbounty?.transactionChecks ?? []).slice(0, 8).map((check) => ({
        verified: check.verified,
        chainId: check.chainId,
        txHash: check.txHash,
        successful: check.successful,
        solverPresent: check.solverPresent,
        solverBalanceDeltaLamports: check.solverBalanceDeltaLamports,
      })),
    },
    walletLinkage: (linkage?.customers ?? []).map((item) => ({
      customerWallet: item.customerWallet,
      indicators: item.indicators,
      directTransfers: item.directTransfers,
      commonNativeFunders: item.commonNativeFunders,
      commonUsdcFunders: item.commonUsdcFunders,
      recentHistoryTruncated: item.recentHistoryTruncated,
    })),
    assertionsNotYetProven: [
      "wallet ownership links",
      "self-payment",
      "GH Bounty mainnet payout",
    ],
  };
}

export function buildEvidenceBundle({ wallet, antseed = null, ghbounty = null, linkage = null }) {
  const sources = [antseed, ghbounty, linkage].filter(Boolean);
  const warnings = sources.flatMap((source) => source.limitations ?? []);

  const result = {
    schemaVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    subject: { wallet },
    sourceStatus: sources.map((source) => ({
      source: source.source,
      found: source.found,
      sourceUrl: source.sourceUrl,
    })),
    objectiveMetrics: {
      antseedRequests: Number(antseed?.activity?.totalRequests ?? 0),
      antseedSettlements: Number(antseed?.activity?.settlementCount ?? 0),
      antseedUniqueBuyers: Number(antseed?.activity?.uniqueBuyers ?? 0),
      ghBountySubmissions: ghbounty?.activity?.submissionCount ?? 0,
      ghBountyWins: ghbounty?.activity?.winCount ?? 0,
      ghBountyRecordedAmountRaw: ghbounty?.activity?.recordedBountyAmount ?? 0,
      antseedRecentSettledUsdc: antseed?.payments?.settledUsdc ?? null,
      antseedRecentUnusedReserveReturnedUsdc: antseed?.payments?.unusedReserveReturnedUsdc ?? null,
      antseedRecentDisputeRefundUsdc: antseed?.payments?.disputeRefundUsdc ?? null,
      antseedRecentCustomerCount: antseed?.payments?.customers?.length ?? null,
      ghBountyVerifiedSubmissionTransactions: ghbounty?.activity?.verifiedSubmissionTransactions ?? 0,
    },
    evidence: { antseed, ghbounty, linkage },
    warnings,
    readiness: {
      canAssessActivity: sources.some((source) => source.found),
      canAssessPaymentFlows: Boolean(antseed?.payments?.events?.length),
      canRunGenLayerJudgment: false,
      reason: "Recent payment evidence can be inspected, but full-history wallet-link analysis and GenLayer consensus are not implemented yet.",
    },
  };
  result.preliminaryAssessment = buildPreliminaryAssessment({ wallet, antseed, ghbounty, linkage });
  result.genLayerInput = buildGenLayerInput({ wallet, antseed, ghbounty, linkage });
  result.genLayerReportId = `air-${createHash("sha256").update(JSON.stringify(result.genLayerInput)).digest("hex")}`;
  return result;
}
