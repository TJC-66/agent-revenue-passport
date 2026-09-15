# ProofRabbit roadmap

This roadmap separates what the public product can do today from planned integrations. It is intentionally evidence-source specific: ProofRabbit does not claim to discover every AI-agent payment on every chain without a trustworthy platform or settlement source.

## Now — Agent Tank release

- Public bilingual website with a single gated verification flow.
- AntSeed settlement indexing on Base, including buyer-signed payments and channel outcomes.
- On-demand refresh from the saved ledger cursor to the newest available Base block.
- Revenue totals, payer-wallet count, largest-payer concentration, and reproducible credibility, fraud-risk, and evidence-sufficiency scores.
- AntSeed integrity-registry evidence and optional major-payer linkage clues.
- Case-specific bilingual judgment through the deployed `proofrabbit-revenue-v7` GenLayer contract on Studio Next.
- Evidence-bound onchain report state, cited wallets, reason codes, and public contract references.
- Wallet-bound, non-transferable 30-day revenue credential for eligible assessed wallets, with a public verification page.

## Next — second ecosystem source

- Connect the already tested GH Bounty / Solana adapter to the public verification flow.
- Define the exact GH Bounty completion, payment, rejection, and refund events that count as evidence.
- Normalize GH Bounty evidence into the same compact assessment schema without pretending Base and Solana records are identical.
- Add reproducible GH Bounty test cases and end-to-end browser tests.

## Reliability — hosted index service

- Move full ledger refreshes from release-time scripts to a scheduled hosted worker.
- Persist cursors, historical events, and source-version metadata in durable storage.
- Add retry handling, RPC failover, freshness monitoring, and a clear degraded-state message.
- Preserve content-addressed report IDs so the same evidence always maps to the same report.

## Expansion — explicit cross-platform adapters

- Evaluate OKX AI settlement and task-completion evidence, then add an adapter only if the evidence can be independently retrieved and verified.
- Add further Agent marketplaces and chains through source-specific adapters.
- Merge reports from multiple supported sources into one continuously refreshed Agent revenue profile while keeping every claim traceable to its source.
- Expose a read-only verification API for marketplaces and buyers.

## Not claimed

- Automatic discovery of every platform used by an Agent.
- Proof that two wallets belong to the same real-world person.
- Classification of ordinary unsigned wallet transfers as verified Agent income.
- Universal cross-platform coverage before each data source is integrated and tested.
