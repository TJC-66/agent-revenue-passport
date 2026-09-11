function percent(value) {
  return value == null ? "unknown" : `${(value * 100).toFixed(1)}%`;
}

// This is an auditable pre-check, not the future GenLayer subjective judgment.
// It refuses to label a wallet as fraudulent when payment or linkage evidence is missing.
export function buildPreliminaryAssessment({ wallet, antseed, ghbounty, linkage }) {
  const payment = antseed?.payments;
  const largestCustomer = payment?.customerBreakdown?.[0] ?? null;
  const reasons = [];

  if (payment?.coverage?.completeWindow && largestCustomer) {
    const settlementCount = payment.settlementCount ?? payment.events?.filter((event) => event.type === "settled").length ?? 0;
    const meaningfulSample = payment.coverage.completeHistory || (settlementCount >= 5 && payment.settledUsdc >= 10);
    const concentrationSeverity = !meaningfulSample
      ? "informational"
      : largestCustomer.share >= 0.8 ? "high" : largestCustomer.share >= 0.5 ? "medium" : "low";
    reasons.push({
      code: "customer_concentration",
      severity: concentrationSeverity,
      explanation: `In the inspected Base window, the largest customer (${largestCustomer.buyer}) supplied ${percent(largestCustomer.share)} of settled value.${meaningfulSample ? "" : " The observed amount or transaction count is too small for this concentration alone to indicate high risk."}`,
      wallets: { agentWallet: wallet, customerWallet: largestCustomer.buyer },
      metrics: { largestCustomerShare: largestCustomer.share, settledUsdc: largestCustomer.settledUsdc, settlementCount, meaningfulSample },
    });
  }

  const devnetOnly = Boolean(ghbounty?.submissions?.length) &&
    ghbounty.submissions.every((item) => item.chain_id === "solana-devnet");
  if (devnetOnly) {
    reasons.push({
      code: "testnet_only_activity",
      severity: "informational",
      explanation: "The observed GH Bounty records are on Solana Devnet, so they prove test activity but not real revenue.",
    });
  }

  for (const link of linkage?.customers ?? []) {
    if (!link.indicators?.length) continue;
    reasons.push({
      code: "wallet_linkage_indicator",
      severity: "medium",
      explanation: `Customer ${link.customerWallet} has these recent wallet-link clues: ${link.indicators.join(", ")}. These clues do not prove common ownership.`,
      wallets: { agentWallet: wallet, customerWallet: link.customerWallet },
      metrics: {
        commonNativeFunders: link.commonNativeFunders?.length ?? 0,
        commonUsdcFunders: link.commonUsdcFunders?.length ?? 0,
        directTransfers: (link.directTransfers?.native?.length ?? 0) + (link.directTransfers?.usdc?.length ?? 0),
      },
    });
  }

  const hasCompletePaymentWindow = Boolean(payment?.coverage?.completeWindow);
  const hasCompletePaymentHistory = Boolean(payment?.coverage?.completeHistory);
  const lifecycle = payment?.lifecycle;
  return {
    status: hasCompletePaymentWindow ? "preliminary" : "no_buyer_approved_income",
    incomeCredibility: payment?.settlementCount ? "buyer_approved" : "no_payment_record",
    fraudOrSelfPaymentRisk: "not_scored",
    buyerAcceptanceRate: lifecycle?.buyerAcceptanceRate ?? null,
    explanation: hasCompletePaymentHistory
      ? "Buyer-signed AntSeed payment history is loaded. Channels that ended without payment are counted separately, and wallet relationships are assessed as a different risk signal."
      : hasCompletePaymentWindow
      ? "Buyer-approved settlements were found. The saved ledger and the newest onchain events are combined for this check."
      : "No buyer-approved AntSeed payment was found for this address.",
    reasons,
    missingEvidence: [
      ...(!hasCompletePaymentWindow ? ["readable Base payment-event window"] : []),
      ...(!hasCompletePaymentHistory ? ["full payment history"] : []),
      "conclusive wallet ownership proof",
      "GenLayer consensus result",
    ],
  };
}
