import json

import pytest


pytestmark = pytest.mark.skip(
    reason="The current gltest package requests a removed GenVM v0.3.0-rc7 archive (GitHub 404)."
)


def test_judge_stores_consensed_structured_result(direct_vm, direct_deploy):
    contract = direct_deploy("agent-income-verifier/contracts/income_credibility_judge.py")
    model_response = {
        "verdict": "insufficient_evidence",
    }
    evidence = {
        "computedAssessment": {
            "policyVersion": "agent-income-v2",
            "internalEvidenceLevel": "no_wash_signals_found",
            "incomeCredibility": 20,
            "selfPaymentRisk": 10,
            "evidenceSufficiency": 15,
            "deliveryAcceptance": None,
        },
        "source": "ghbounty",
        "chain": "solana-devnet",
    }
    direct_vm.mock_llm("independent reviewer of possible AI Agent wash trading", json.dumps(model_response))
    contract.judge("report-1", json.dumps(evidence))
    assert json.loads(contract.get_judgment("report-1")) == {
        "policy_version": "agent-income-v2",
        "income_credibility": 20,
        "self_payment_risk": 10,
        "evidence_sufficiency": 15,
        "delivery_acceptance": None,
        **model_response,
        "reason_codes": ["missing_settlements", "insufficient_evidence"],
        "cited_wallets": [],
    }


def test_judge_rejects_duplicate_report(direct_vm, direct_deploy):
    contract = direct_deploy("agent-income-verifier/contracts/income_credibility_judge.py")
    evidence = {
        "computedAssessment": {
            "policyVersion": "agent-income-v2",
            "internalEvidenceLevel": "no_wash_signals_found",
            "incomeCredibility": 0,
            "selfPaymentRisk": 0,
            "evidenceSufficiency": 95,
            "deliveryAcceptance": None,
        },
        "subjectWallet": "0x0000000000000000000000000000000000000001",
        "sources": {"antseed": {"settlementCount": 0}},
    }
    contract.judge("same", json.dumps(evidence))
    with direct_vm.expect_revert("already judged"):
        contract.judge("same", json.dumps(evidence))
