# 08. Implementation Roadmap & Bounty Allocation

## 1. Phased 10-Week Execution Plan

The transition from the current HTML prototype to an audited production deployment is structured into four milestone sprints over 8 to 10 weeks:

| Phase | Duration | Core Deliverables | Critical Engineering Bottlenecks |
|:---|:---|:---|:---|
| **Phase 1: Domain Audit & Email Scraping** | **Weeks 1–2** | • Scrape verified author emails from recent arXiv/Crossref PDFs for Simon's 300 AI list.<br>• Automated DNSSEC & DKIM selector discovery CLI across ~100 university domains. | OpenAlex masks emails; parsing LaTeX/PDF correspondence blocks is required to map specific author addresses. |
| **Phase 2: ZK Circuit & Relayer Infrastructure** | **Weeks 3–4** | • Groth16 Circom & UltraHonk Noir circuits verifying RSA signatures, email commitments, and pubkey binding.<br>• Stateless Actix-Web SSE broker + Cloudflare Worker. | Departmental CS subdomains (`@cs.cmu.edu`, `@inf.ethz.ch`) vary between 1024, 2048, and 4096-bit RSA keys. |
| **Phase 3: Ballot UI Wiring & Content-Addressing** | **Weeks 5–6** | • Upgrade [Scientific Vote Ballot.html](file:///d:/workspace/dapp/zk-circuit/Scientific%20Vote%20Ballot.html) with WebCrypto key generation and deterministic JSON signing.<br>• IPFS/Arweave manifest bundler storing proofs, signed ballots, and DNSSEC snapshots. | Preserving the static web app invariant: zero external runtime dependencies. |
| **Phase 4: Security Audit & Academic Pilot** | **Weeks 7–10** | • Comprehensive smart contract & circuit audit with ecosystem partner **AuditOne**.<br>• End-to-end dry-run with 15 friendly academic panellists. | Mitigating email relay mutations (Proofpoint, Microsoft Defender rewriting headers) discovered in live testing. |

---

## 2. Funding Mechanics: Rethink Finance Vault & Safe/Zodiac

As mandated by Slide 12 and Slide 13:
> *"You keep the asset. You contribute the yield. 1,000 ETH staked into the vault (~2.5% yield) -> ~25 ETH per year funding the work. No salaried staff, by design."*

### 2.1 Safe Multi-Sig & Zodiac Scoped Modules
- **Vault:** Staking yield from `soonami4good.rethink.finance` flows directly into a **Gnosis Safe** smart account.
- **Zodiac Roles Module:** Bounties are executed via Zodiac scoped execution modules, permitting atomic milestone payouts upon cryptographic delivery verification without granting general treasury access.

### 2.2 Milestone Bounty Disbursements

```
[Rethink Finance Vault Yield]
              │
              ▼
    [Safe Treasury Account]
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
[Bounty 1] [Bounty 2] [Bounty 3]
  M1 (25%)   M2-M3 (50%) M4 (25%)
```

1. **Bounty 1 (Weeks 1–2):** Automated Ingestion & DKIM Survey Engine.
2. **Bounty 2 (Weeks 3–6):** Circom/Noir Circuits, Actix-Web Broker, and Ballot Box Integration.
3. **Bounty 3 (Weeks 7–10):** Audit Remediation, Testnet Pilot, and Mainnet Deployment.

---

## 3. Security Audit Gate with AuditOne

Before opening the binding AI-300 ballot:
1. **Circuit Verification:** AuditOne audits the Circom and Noir circuits for constraint under-determination, variable overflow, and regex boundary leakage.
2. **Contract Verification:** Verifies the Groth16 SnarkJS on-chain verifier and nullifier registry contract.
3. **Standing Bug Bounty:** Funded from vault yield, a permanent bug bounty rewards researchers identifying critical vulnerabilities in identity binding or ballot sealing.
