import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../contracts/income_credibility_judge.py", import.meta.url), "utf8");

test("ProofRabbit v7 does not ask validators to rescore deterministic metrics", () => {
  assert.match(source, /POLICY_VERSION = "proofrabbit-revenue-v7"/);
  assert.match(source, /Never recalculate or replace them/);
  assert.doesNotMatch(source, /SCORE_TOLERANCE/);
  assert.doesNotMatch(source, /own_value\["verdict"\]/);
});

test("ProofRabbit v7 stores a case-specific bilingual GenLayer analysis", () => {
  assert.match(source, /headline_zh/);
  assert.match(source, /summary_en/);
  assert.match(source, /findings/);
  assert.match(source, /_normalise_analysis/);
});

test("ProofRabbit validators independently classify the same evidence", () => {
  assert.match(source, /validator_analysis = leader\(\)/);
  assert.match(source, /leader_analysis\["risk_profile"\] == validator_analysis\["risk_profile"\]/);
  assert.match(source, /leader_analysis\["primary_risk"\] == validator_analysis\["primary_risk"\]/);
  assert.match(source, /run_nondet_default\(leader, validator\)/);
  assert.doesNotMatch(source, /VALIDATION_PROMPT/);
});

test("ProofRabbit v7 does not revert when generated prose is malformed", () => {
  assert.match(source, /def _fallback_analysis/);
  assert.match(source, /def _normalise_analysis/);
  assert.match(source, /except Exception:\n\s+raw = \{\}/);
  assert.doesNotMatch(source, /proposed analysis is not grounded in the evidence/);
});

test("ProofRabbit gives the LLM a compact factual evidence view", () => {
  assert.match(source, /def _analysis_evidence/);
  assert.match(source, /"settlementHistory"/);
  assert.match(source, /"walletLinkage"/);
  assert.match(source, /analysis_evidence = _analysis_evidence\(evidence\)/);
});

test("ProofRabbit v7 treats payer concentration as risk rather than fraud proof", () => {
  assert.match(source, /Do not treat customer concentration alone as fraud/);
  assert.match(source, /largest_customer_share.*>= 0\.5/s);
  assert.match(source, /profile == "fraud_detected" and not \(signals\["has_linkage"\] or signals\["has_official_fraud"\]\)/);
});

test("ProofRabbit v7 grounds public reasons in submitted evidence", () => {
  assert.match(source, /def _grounded_reasons/);
  assert.match(source, /def _grounded_wallets/);
  assert.match(source, /response_format="json"/);
  assert.match(source, /run_nondet_default\(leader, validator\)/);
});

test("ProofRabbit v7 issues only wallet-bound, non-transferable credentials", () => {
  assert.match(source, /ATTESTATION_VERSION = "proofrabbit-revenue-attestation-v3"/);
  assert.match(source, /gl\.message\.sender_address != subject/);
  assert.match(source, /def claim_credential/);
  assert.match(source, /def get_credential/);
  assert.doesNotMatch(source, /def transfer/);
});

test("ProofRabbit v7 content-addresses and preserves the judged evidence", () => {
  assert.match(source, /hashlib\.sha256\(evidence_json\.encode\('utf-8'\)\)/);
  assert.match(source, /report_id does not match the submitted evidence/);
  assert.match(source, /evidence_by_report/);
  assert.match(source, /def get_evidence/);
});
