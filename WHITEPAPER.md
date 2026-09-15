# ProofRabbit — Verifiable Revenue Evidence for AI Agents

Version: `proofrabbit-revenue-v7`
Credential standard: `proofrabbit-revenue-attestation-v3`
Network: GenLayer Studio Next (chain ID 61997)
Status: working public prototype

## Abstract

AI agents can advertise revenue, customers, and successful work, but a wallet balance alone does not show whether money came from real business activity. Ordinary transfers, related-wallet payments, and concentrated revenue can all make an agent appear more established than it is.

ProofRabbit converts platform-specific, buyer-signed settlement records into a clear revenue-evidence report. Deterministic code calculates reproducible metrics, while a GenLayer Intelligent Contract produces a case-specific bilingual conclusion grounded in the submitted evidence. Eligible agent wallets can claim a non-transferable, expiring onchain revenue credential that anyone can verify directly from the contract.

## 1. Problem

Customers and agent marketplaces need to answer a practical question before trusting an AI agent: does its claimed revenue resemble genuine customer activity?

Three common shortcuts are not enough:

- A wallet balance does not distinguish business income from deposits or self-transfers.
- A transaction count does not prove that the payers are independent customers.
- A screenshot or profile badge can become stale and cannot prove what the issuer currently stores.

ProofRabbit therefore begins with platform settlement evidence rather than all wallet inflows.

## 2. Current product scope

The live product currently supports AntSeed settlement activity on Base. It maintains a historical AntSeed event ledger and refreshes the blocks after its saved cursor when a verification starts. It identifies buyer-signed settlements and calculates:

- total settled revenue;
- number of payer wallets;
- largest payer's share of revenue;
- completed, unpaid, and returned-fund channel outcomes;
- abnormal-settlement records from AntSeed's integrity registry;
- direct-transfer and common-funding clues among major payer wallets when public explorer data is available;
- income credibility, fraud risk, and evidence sufficiency.

The repository also contains a locally tested GH Bounty adapter for Solana records. It is not yet connected to the public assessment flow. ProofRabbit does not claim universal cross-platform coverage today.

## 3. Evidence pipeline

### 3.1 Platform settlement indexing

ProofRabbit separates business settlement events from unrelated wallet transfers. For AntSeed, a payment is counted as verified platform revenue only when the indexed channel record contains the buyer's signature and the settlement can be reconstructed from public chain events.

### 3.2 Deterministic assessment

The indexer creates a compact evidence bundle. Fixed rules calculate the three numerical metrics so unchanged evidence produces unchanged scores. This prevents validators from inventing or randomly changing transaction totals.

### 3.3 Wallet-link clues

The system can inspect major payer wallets for direct transfers and common funding sources. These are risk signals, not absolute proof that two addresses have the same owner. The public explanation states what was observed and avoids claiming hidden identity knowledge.

### 3.4 Content-addressed report

Each report ID is derived from the SHA-256 digest of its canonical evidence payload. The contract rejects report IDs that do not match the submitted evidence. This binds the public judgment to the exact data package that was assessed.

## 4. GenLayer's role

GenLayer is not asked to recalculate deterministic revenue totals. The leader turns the compact facts into a case-specific bilingual conclusion, summary, and set of findings. Other validators independently assess the same evidence and vote on the decision-bearing `risk_profile` and `primary_risk`. They do not invent another set of scores or require independently generated prose to match word-for-word.

The contract stores:

- the accepted bilingual analysis;
- grounded reason codes;
- cited wallet addresses;
- the exact judged evidence;
- policy and evidence versions.

The website displays the stored Chinese or English analysis first, then the scores and underlying evidence. A concentrated payer share is explained as customer-dependence risk unless stronger wallet-link or official fraud evidence supports a fraud finding.

## 5. Revenue credential

An eligible assessed wallet can claim a ProofRabbit revenue credential after a favorable judgment. The credential is:

- bound to the assessed wallet and not transferable;
- claimable only by that wallet;
- valid for 30 days;
- revocable by its wallet owner;
- automatically superseded when the same wallet claims a newer credential;
- publicly verifiable from the GenLayer contract.

Current eligibility requires a `no_fraud_signals` risk profile, income credibility of at least 70, fraud risk no higher than 30, and evidence sufficiency of at least 70. A high-risk or insufficient report remains auditable onchain but cannot be presented as a positive credential.

## 6. Security and integrity

The v7 contract rejects malformed JSON, unsupported policy versions, contradictory credibility and risk metrics, oversized evidence payloads, reused report IDs, and mismatched evidence digests. It normalizes model output to the allowed evidence-backed decision types and falls back to a deterministic evidence-derived analysis if a response is malformed. Submitted strings are treated as untrusted evidence rather than instructions.

The website reads only public wallet addresses when connecting to an injected EVM wallet. It never requests a seed phrase or private key and does not request unlimited token approval. Every Studio Next write uses GenLayer's official Transaction Kit fee flow and is displayed by the user's wallet for explicit confirmation.

## 7. Data freshness and limitations

The public build combines a portable historical snapshot with an on-demand recent-block refresh. The snapshot is refreshed manually before releases; a production deployment should run a persistent scheduled indexer and store its ledger in hosted infrastructure.

ProofRabbit does not prove real-world identity, does not automatically discover every payment made to every AI agent, and does not call an unsigned ordinary transfer verified business revenue. Each additional marketplace requires a trustworthy adapter or settlement data source.

## 8. Roadmap

The maintained implementation roadmap is published in [`ROADMAP.md`](./ROADMAP.md). In short: GH Bounty / Solana is the next public adapter, followed by hosted index refresh and monitoring, then explicit integrations for OKX AI and other Agent marketplaces. ProofRabbit will not claim universal coverage until each platform has a reliable settlement-evidence source.

## 9. Current deployment

- Website: https://agent-revenue-passport.manshiguang124.chatgpt.site
- Source: https://github.com/TJC-66/agent-revenue-passport
- GenLayer policy: `proofrabbit-revenue-v7`
- Studio Next contract: `0x79ab7ac7a17920354547A0B0b1d8f955F76278CC`
- Successful deployment transaction: `0x36a61596567852d5ed693bdcadfb85961fa1e34704d4b12b733049b1452cb506`
- Studio Next explorer: https://explorer-studio-dev.genlayer.com/
- RPC: `https://studio-next.genlayer.com/api`

## 10. Reproducible examples

| Risk level | Agent wallet | Expected metrics |
| --- | --- | --- |
| Low | `0x4668854ba3e8b094e6f48fbeb59cec1cfde162f2` | credibility 85, fraud risk 15, evidence 95 |
| Medium | `0xbc33134b5f441ca1aa4a47e6e79f4e170285b75f` | credibility 55, fraud risk 45, evidence 95 |
| High | `0x0329c5d3920e301740f78d6e17b8d1a11cca9b2c` | credibility 5, fraud risk 95, evidence 95 |
