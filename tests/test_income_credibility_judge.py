import hashlib
import json

import pytest


pytestmark = pytest.mark.skip(
    reason="The current gltest package requests a removed GenVM v0.3.0-rc7 archive (GitHub 404)."
)


def test_judge_stores_consensed_structured_result(direct_vm, direct_deploy):
    contract = direct_deploy("agent-income-verifier/contracts/income_credibility_judge.py")
    model_response = {
        "risk_profile": "no_payment_history",
        "headline_zh": "没有可验证的付款记录",
        "headline_en": "No verifiable payment history",
        "summary_zh": "这个地址没有买方签名的付款记录，因此目前没有可以验证的业务收入。",
        "summary_en": "This address has no buyer-signed payment record, so there is no business revenue to verify yet.",
        "findings": [{
            "kind": "missing_payment_history",
            "severity": "notice",
            "title_zh": "没有付款记录",
            "title_en": "No payment history",
            "detail_zh": "链上没有找到买方签名结算。",
            "detail_en": "No buyer-signed settlement was found onchain.",
        }],
    }
    evidence = {
        "computedAssessment": {
            "policyVersion": "proofrabbit-revenue-v7",
            "internalEvidenceLevel": "no_fraud_signals_found",
            "incomeCredibility": 20,
            "selfPaymentRisk": 10,
            "evidenceSufficiency": 15,
            "deliveryAcceptance": None,
        },
        "subjectWallet": "0x0000000000000000000000000000000000000001",
        "source": "ghbounty",
        "chain": "solana-devnet",
    }
    direct_vm.mock_llm("final public GenLayer analysis", json.dumps(model_response))
    evidence_json = json.dumps(evidence)
    report_id = f"air-{hashlib.sha256(evidence_json.encode('utf-8')).hexdigest()}"
    contract.judge(report_id, evidence_json)
    result = json.loads(contract.get_judgment(report_id))
    assert result.pop("judged_at")
    assert result == {
        "report_id": report_id,
        "policy_version": "proofrabbit-revenue-v7",
        "subject_wallet": "0x0000000000000000000000000000000000000001",
        "evidence_digest": report_id.removeprefix("air-"),
        "income_credibility": 20,
        "self_payment_risk": 10,
        "evidence_sufficiency": 15,
        "delivery_acceptance": None,
        "risk_profile": "no_payment_history",
        "verdict": "insufficient_evidence",
        "analysis": model_response,
        "reason_codes": ["missing_settlements", "insufficient_evidence"],
        "cited_wallets": ["0x0000000000000000000000000000000000000001"],
    }


def test_judge_rejects_duplicate_report(direct_vm, direct_deploy):
    contract = direct_deploy("agent-income-verifier/contracts/income_credibility_judge.py")
    evidence = {
        "computedAssessment": {
            "policyVersion": "proofrabbit-revenue-v7",
            "internalEvidenceLevel": "no_fraud_signals_found",
            "incomeCredibility": 0,
            "selfPaymentRisk": 0,
            "evidenceSufficiency": 95,
            "deliveryAcceptance": None,
        },
        "subjectWallet": "0x0000000000000000000000000000000000000001",
        "sources": {"antseed": {"settlementCount": 0}},
    }
    evidence_json = json.dumps(evidence)
    report_id = f"air-{hashlib.sha256(evidence_json.encode('utf-8')).hexdigest()}"
    contract.judge(report_id, evidence_json)
    with direct_vm.expect_revert("already judged"):
        contract.judge(report_id, evidence_json)
