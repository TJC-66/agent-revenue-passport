# ProofRabbit (证明兔) — Agent Tank submission package

## Primary tag

Agentic Commerce Infrastructure

## Suggested topics

- AI Agent reputation
- Payments and fraud detection

## One-line description

ProofRabbit turns buyer-signed onchain settlements into an explainable AI-agent revenue and fraud-risk report, with GenLayer providing the final onchain judgment.

## Project overview

Wallet inflows alone do not prove that an AI agent earned money from real customers. An operator can move funds between related wallets, while a genuine payment can be buried inside thousands of ordinary transfers.

ProofRabbit starts from business evidence rather than raw wallet balance. The current working product indexes AntSeed channel activity on Base and identifies settlements that contain a buyer signature. It summarizes how much the agent earned, how many payer wallets paid it, whether revenue is concentrated in one payer, how completed channels ended, whether AntSeed recorded abnormal settlements, and whether major payer wallets show direct transfers or common funding.

The numerical metrics are calculated once by a deterministic policy so that the same evidence produces the same scores. A compact, versioned evidence bundle is then submitted to a GenLayer Intelligent Contract. The leader writes a case-specific bilingual conclusion, summary, and set of findings. Other validators independently assess the same evidence and vote on the decision-bearing risk profile and primary risk. They do not invent another set of scores or require independently generated prose to match word-for-word. The accepted analysis is stored onchain with reason codes and cited wallets, then shown first by the website.

An eligible Agent can then use the assessed wallet itself to claim a non-transferable ProofRabbit revenue credential. The credential is valid for 30 days, can be revoked, and is superseded by a newer credential for the same wallet. A public read-only profile verifies the current credential directly from GenLayer and exposes its report ID and evidence digest instead of relying on a screenshot or QR badge.

The live prototype currently supports AntSeed settlements on Base. A GH Bounty adapter has been tested locally, but GH Bounty is not yet part of the public verification flow. It is the next ecosystem integration. Later versions can add OKX AI and other agent marketplaces while continuing to use GenLayer as the judgment layer.

## Who it is for

- Customers checking an agent before purchasing its service.
- Marketplaces deciding whether an agent's revenue history is credible.
- Agent operators who want an evidence-backed business record that can later become a shareable cross-platform profile.

## How to try it

1. Open the public ProofRabbit website.
2. Paste an AntSeed agent's Base wallet address, choose Chinese or English, and click **Verify Agent**.
3. ProofRabbit refreshes the settlement evidence and wallet-link clues without exposing a partial result.
4. Choose a compatible EVM wallet and approve the GenLayer judgment transaction shown by the wallet on Studio Next. If the exact report already has an onchain judgment, ProofRabbit reads that result and does not send a duplicate transaction.
5. After GenLayer completes the judgment, the page reveals the full report at once: the plain-language GenLayer verdict first, followed by scores, evidence, cited wallets, the transaction record, and credential eligibility.
6. When eligible, the assessed wallet itself can claim the non-transferable revenue credential.

## Expected verification outcome

- A wallet with diverse buyer-signed settlements and no strong linkage clues should produce a credible revenue profile with a low fraud risk.
- A wallet with abnormal settlements or strong links among major payer wallets should produce a red high-risk result and a plain-language explanation of the evidence.
- A wallet with no buyer-signed AntSeed settlement should be reported as having no verified revenue record, rather than treating ordinary transfers as agent income.
- Repeating a check against unchanged evidence should not randomly change the deterministic scores.

## Current scope and roadmap

**Working now:** AntSeed settlement indexing on Base, recent-block refresh when a verification starts, buyer-signature and channel-outcome analysis, payer concentration, AntSeed integrity records, optional payer-wallet linkage checks, bilingual results, the deployed ProofRabbit v7 GenLayer judgment and credential contract, the wallet-owner claim flow, and a public credential-verification page. The live product calls the real v7 contract on Studio Next through Transaction Kit RC2.

**Next:** connect the tested GH Bounty/Solana adapter to the public workflow and schedule full background index refreshes.

**Later:** add explicit adapters for OKX AI and other agent marketplaces. The project does not claim to identify every AI-agent payment on every chain without platform evidence.

## Links and onchain proof

- Website: `https://agent-revenue-passport.manshiguang124.chatgpt.site`
- Public GitHub repository: https://github.com/TJC-66/agent-revenue-passport
- GenLayer Studio Next contract: `0x79ab7ac7a17920354547A0B0b1d8f955F76278CC`
- Successful deployment transaction: `0x36a61596567852d5ed693bdcadfb85961fa1e34704d4b12b733049b1452cb506`
- Studio Next explorer: https://explorer-studio-dev.genlayer.com/
- Network: Studio Next, chain ID `61997`, RPC `https://studio-next.genlayer.com/api`
- Demo video: mandatory and still pending

## Current hackathon checklist (verified 16 September 2026)

- **Build deadline:** 17 September 2026. The public Portal does not publish an exact hour, so use the countdown shown in the signed-in Portal as the cutoff.
- **Studio Next deployment is mandatory:** satisfied by the v7 contract above.
- **Real GenLayer contract call:** satisfied by the public verification flow.
- **Meaningful contract state and validator decision:** satisfied; the contract stores the evidence-bound judgment and credential state, while validators vote on the meaningful risk outcome.
- **Working public frontend and repository:** satisfied, subject to a final clean-browser check before submission.
- **Demo video:** mandatory even if the Portal field is labelled optional; still to record and upload.
- **Submit early:** the entry can be submitted during the build period and improved before the deadline. If the Portal shows **Action needed**, respond to the review note and update the entry.
- **Community review:** ratings and comments can be collected while the entry is under review; the final shortlist is informed by community feedback.

Official references:

- Agent Tank Portal: https://portal.genlayer.foundation/agent-tank/
- Consensus v0.6 migration notes: https://docs.genlayer.com/developers/consensus-v06-migration#test-on-studio-dev-first
- Transaction Kit RC2 boilerplate branch: https://github.com/genlayerlabs/genlayer-project-boilerplate/tree/v2-dev

## Evidence packaging decision

The Portal application should use the live website, public GitHub repository, mandatory demo video, and exact Studio Next contract and transaction IDs. Screenshots belong in `docs/screenshots/` and in the README as quick visual proof. A PDF is not necessary because the application form does not provide a general PDF-evidence field, and directly verifiable chain references are stronger than a PDF.

Prepared evidence images:

- `docs/screenshots/01-landing-final.jpg` — clean landing page.
- `docs/screenshots/02-medium-final.jpg` — reproducible medium-risk case.
- `docs/screenshots/03-high-summary-final.jpg` — high-risk evidence summary.
- `docs/screenshots/05-low-final.jpg` — reproducible low-risk case.

The approved logo is `docs/proofrabbit-logo-approved.png` (1024 × 1024 PNG). It is used in the product header, browser icon, and sharing metadata. The old v2 judgment screenshot remains only as a development-history file and must not be submitted as proof of the current contract.
