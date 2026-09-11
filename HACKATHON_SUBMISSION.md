# Agent Revenue Passport — Agent Tank application draft

## Primary tag

Agentic Commerce Infrastructure

## Suggested topics

- AI Agent reputation
- Payments and fraud detection

## One-line description

Agent Revenue Passport turns buyer-signed onchain settlements into a portable AI-agent revenue profile, with GenLayer providing the final fraud judgment.

## Project overview

Wallet inflows alone do not prove that an AI agent earned money from real customers. An operator can move funds between related wallets, while a genuine payment can be buried inside thousands of ordinary transfers.

Agent Revenue Passport starts from business evidence rather than raw wallet balance. The current working product indexes AntSeed channel activity on Base and identifies settlements that contain a buyer signature. It summarizes how much the agent earned, how many payer wallets paid it, whether revenue is concentrated in one payer, how completed channels ended, whether AntSeed recorded abnormal settlements, and whether major payer wallets show direct transfers or common funding.

The numerical metrics are calculated once by a deterministic policy so that the same evidence produces the same scores. A compact, versioned evidence bundle is then submitted to a deployed GenLayer Intelligent Contract. GenLayer validators do not invent another set of scores; they independently decide the final question: do the submitted facts support a finding of fraudulent revenue activity? The result is stored onchain with grounded reason codes and cited wallets. The website translates that result into direct, plain-language Chinese or English.

The live prototype currently supports AntSeed settlements on Base. A GH Bounty adapter has been tested locally, but GH Bounty is not yet part of the public verification flow. It is the next ecosystem integration. Later versions can add OKX AI and other agent marketplaces while continuing to use GenLayer as the judgment layer.

## Who it is for

- Customers checking an agent before purchasing its service.
- Marketplaces deciding whether an agent's revenue history is credible.
- Agent operators who want a portable, evidence-backed business record.

## How to try it

1. Open the public Agent Revenue Passport website.
2. Paste an AntSeed agent's Base wallet address. The read-only check does not require a wallet connection.
3. Choose Chinese or English, then click **Verify Agent**.
4. Review buyer-signed revenue, payer concentration, payment history, wallet-link clues, and the deterministic risk metrics.
5. To request the onchain judgment, connect a compatible EVM wallet and click **Submit to GenLayer**. The wallet shows the Bradbury testnet transaction for the user to approve.
6. When consensus finishes, read the plain-language GenLayer judgment and open the public contract or transaction in the Bradbury explorer.

## Expected verification outcome

- A wallet with diverse buyer-signed settlements and no strong linkage clues should produce a credible revenue profile with a low fraud risk.
- A wallet with abnormal settlements or strong links among major payer wallets should produce a red high-risk result and a plain-language explanation of the evidence.
- A wallet with no buyer-signed AntSeed settlement should be reported as having no verified revenue record, rather than treating ordinary transfers as agent income.
- Repeating a check against unchanged evidence should not randomly change the deterministic scores.

## Current scope and roadmap

**Working now:** AntSeed settlement indexing on Base, recent-block refresh when a verification starts, buyer-signature and channel-outcome analysis, payer concentration, AntSeed integrity records, optional payer-wallet linkage checks, bilingual results, and a deployed GenLayer v2 judgment contract.

**Next:** connect the tested GH Bounty/Solana adapter to the public workflow and schedule full background index refreshes.

**Later:** add explicit adapters for OKX AI and other agent marketplaces. The project does not claim to identify every AI-agent payment on every chain without platform evidence.

## Links and onchain proof

- Website: `https://agent-revenue-passport.manshiguang124.chatgpt.site`
- Public GitHub repository: https://github.com/TJC-66/agent-revenue-passport
- GenLayer contract: `https://explorer-bradbury.genlayer.com/address/0x0a85C6Dd93051d11775f4F8709d372e4f821a698`
- Contract address: `0x0a85C6Dd93051d11775f4F8709d372e4f821a698`
- Deployment transaction: `0x4c86150c0a772e818fee99e91044a282d84be6514df4240499f8342eb11f9e43`
- Successful judgment transactions: add the selected low-, medium-, and high-risk Bradbury transaction links after explorer verification
- Demo video: pending

## Evidence packaging decision

The Portal application should use the live website, public GitHub repository, demo video, and exact Bradbury explorer links. Screenshots belong in `docs/screenshots/` and in the README as quick visual proof. A PDF is not necessary because the application form does not provide a general PDF-evidence field, and a PDF is weaker than directly verifiable explorer links.

Prepared evidence images:

- `docs/screenshots/01-landing-final.jpg` — clean landing page.
- `docs/screenshots/02-medium-final.jpg` — reproducible medium-risk case.
- `docs/screenshots/03-high-summary-final.jpg` — high-risk deterministic evidence summary.
- `docs/screenshots/04-high-genlayer-final.jpg` — stored GenLayer v2 fraud judgment and contract address.
- `docs/screenshots/05-low-final.jpg` — reproducible low-risk case.

The logo upload is `docs/agent-revenue-passport-logo.png` (1024 × 1024 PNG).
