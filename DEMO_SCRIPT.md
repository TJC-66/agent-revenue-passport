# ProofRabbit (证明兔) — demo recording plan

Target length: 70–85 seconds. Record at 1080p with the browser zoom set so the input, score cards, and GenLayer result remain readable. Do not show seed phrases, private keys, wallet balances, email addresses, or unrelated browser tabs.

## 0–8 seconds — the problem

**Screen:** Open the clean landing page. Do not prefill an address.

**Voiceover:**

> An AI agent can show you a wallet balance. But that does not prove the money came from real customers.

## 8–25 seconds — a low-risk profile

**Screen:** Paste `0x4668854ba3e8b094e6f48fbeb59cec1cfde162f2`, click **Verify Agent**, then cut past the loading and wallet-confirmation time. The finished page should open on the GenLayer plain-language verdict; then show the scores and buyer-signed settlement totals below it.

**Voiceover:**

> ProofRabbit starts with buyer-signed settlements. It checks how much the agent earned, how many payer wallets paid it, whether revenue is concentrated, and whether the payment history contains suspicious patterns.

## 25–43 seconds — explain the medium-risk case

**Screen:** Paste `0xbc33134b5f441ca1aa4a47e6e79f4e170285b75f`, cut past loading, and pause on the 86.30% largest-payer share.

**Voiceover:**

> This agent has real signed payments, but one payer contributed more than eighty-six percent of its revenue. The product does not call that fraud. It explains the concentration risk in plain language.

## 43–63 seconds — show the high-risk evidence

**Screen:** Paste `0x0329c5d3920e301740f78d6e17b8d1a11cca9b2c`, cut past loading, and show the red high-risk result and the 94.58% anomalous-settlement share.

**Voiceover:**

> In this case, most settled value is already recorded as anomalous. The deterministic layer prepares one compact evidence bundle instead of asking AI models to invent the numbers again.

## 63–80 seconds — GenLayer's role

**Screen:** Scroll to the **GenLayer onchain judgment** shown first in the result. Show the stored `proofrabbit-revenue-v7` case-specific explanation, its concrete findings, the Studio Next contract address, and the cited evidence. For an eligible wallet, briefly show the wallet-bound credential and its public verification page. Do not send another transaction during the recording.

**Voiceover:**

> GenLayer writes a conclusion for this exact address. Other validators independently assess the same evidence and agree on the key risk decision. The accepted Chinese and English analysis is stored onchain.

## Final card

**On-screen text:**

> ProofRabbit
>
> Verify revenue before you trust an agent.

## Recording notes

- Use jump cuts to remove the 10–60 second data refresh and the optional wallet-link scan.
- Record the three addresses in separate takes, then join them. This is cleaner than waiting on camera.
- For a smooth recording, use a report that already has a stored GenLayer judgment; the unified flow will load it without sending a duplicate transaction.
- If demonstrating a genuinely new report, record the wallet confirmation once, hide sensitive wallet details, and cut the consensus wait while preserving the real before-and-after sequence.
