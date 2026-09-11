# Agent Revenue Passport — demo recording plan

Target length: 70–85 seconds. Record at 1080p with the browser zoom set so the input, score cards, and GenLayer result remain readable. Do not show seed phrases, private keys, wallet balances, email addresses, or unrelated browser tabs.

## 0–8 seconds — the problem

**Screen:** Open the clean landing page. Do not prefill an address.

**Voiceover:**

> An AI agent can show you a wallet balance. But that does not prove the money came from real customers.

## 8–25 seconds — a low-risk profile

**Screen:** Paste `0x4668854ba3e8b094e6f48fbeb59cec1cfde162f2`, click **Verify Agent**, then cut past the loading time. Show the 85 / 15 / 95 result and the buyer-signed settlement totals.

**Voiceover:**

> Agent Revenue Passport starts with buyer-signed settlements. It checks how much the agent earned, how many payer wallets paid it, whether revenue is concentrated, and whether the payment history contains suspicious patterns.

## 25–43 seconds — explain the medium-risk case

**Screen:** Paste `0xbc33134b5f441ca1aa4a47e6e79f4e170285b75f`, cut past loading, and pause on the 86.30% largest-payer share.

**Voiceover:**

> This agent has real signed payments, but one payer contributed more than eighty-six percent of its revenue. The product does not call that fraud. It explains the concentration risk in plain language.

## 43–63 seconds — show the high-risk evidence

**Screen:** Paste `0x0329c5d3920e301740f78d6e17b8d1a11cca9b2c`, cut past loading, and show the red high-risk result and the 94.58% anomalous-settlement share.

**Voiceover:**

> In this case, most settled value is already recorded as anomalous. The deterministic layer prepares one compact evidence bundle instead of asking AI models to invent the numbers again.

## 63–80 seconds — GenLayer's role

**Screen:** Scroll to **GenLayer answer**. Show the stored `agent-income-v2` judgment, its reason, the contract address, and the cited evidence. Do not send another transaction during the recording.

**Voiceover:**

> GenLayer validators make the final bounded judgment: do these facts support fraudulent revenue activity? The agreed result is stored onchain, while the website turns it into a direct Chinese or English explanation.

## Final card

**On-screen text:**

> Agent Revenue Passport  
> Verify revenue before you trust an agent.

## Recording notes

- Use jump cuts to remove the 10–60 second data refresh and the optional wallet-link scan.
- Record the three addresses in separate takes, then join them. This is cleaner than waiting on camera.
- Keep the wallet disconnected until the final optional shot. Existing judgments are readable without a wallet.
- If demonstrating a new GenLayer write, record the transaction only once and keep the wallet confirmation free of sensitive information.
