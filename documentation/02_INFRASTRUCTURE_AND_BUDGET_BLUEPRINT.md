# Infrastructure & Budget Blueprint: 2026 AI Scientific Vote
## Production Account Requisition, Financial Model & Sovereign Storage Strategy

**Target Audience:** CEO, Operations, DevOps Engineers, Legal & Compliance  
**Classification:** Operational Budget & Infrastructure Account Requisition  
**Governance Framework:** Rethink Finance Staking Vault Yield & Gnosis Safe Multisig Model  
**Related Documents:** [01_EXECUTIVE_SYSTEM_OVERVIEW.md](file:///d:/workspace/dapp/zk-circuit/documentation/01_EXECUTIVE_SYSTEM_OVERVIEW.md)

---

## 1. Executive Summary & Funding Context

The **2026 AI Scientific Vote** operates on an autonomous, non-custodial decentralized infrastructure designed to evaluate frontier AI safety and capability across the top 300 global AI researchers (selected via Simon's Condorcet-consistent algorithm).

In accordance with **Slide 12 and 13 invariants**:
> *"You keep the asset. You contribute the yield. 1,000 ETH staked into the vault (~2.5% yield) -> ~25 ETH per year funding the work. No salaried staff, by design."*

All operational expenses (OpEx), gas sponsorship funds, security audit retainers, and infrastructure accounts are funded directly from **Rethink Finance staking vault yield** (`soonami4good.rethink.finance`) routed into a **Gnosis Safe 3-of-5 multisig** smart account.

---

## 2. Infrastructure Account Requisition Matrix

The finance and operations team must provision the following specific accounts and infrastructure resources:

| # | Infrastructure Service | Provider / Service | Tier / Plan | Estimated Cost | Payment Method | Custody / Access Requirement |
|:---|:---|:---|:---|:---|:---|:---|
| **1** | **Edge Mail Worker & DNS** | Cloudflare Inc. | **Workers Paid / Pro** | $5.00 / month ($60 / year) | Credit Card | Corporate email + Hardware 2FA (FIDO2 / YubiKey) |
| **2** | **Relayer & Sovereign IPFS VPS** | Hetzner / AWS Lightsail / OVH | **Linux Cloud VPS** (4 vCPU, 8GB RAM, 160GB NVMe) | ~$12.00 – $22.00 / month (~$144 – $264 / year) | Credit Card / Wire | SSH Key only; root login disabled; ed25519 keys |
| **3** | **Ethereum RPC Node Provider** | Alchemy / QuickNode / Infura | **Developer / Growth Tier** | $0 (Free) during testnet; $49 during election month | Credit Card | API Key restricted to broker IP & contract address |
| **4** | **Decentralized Domain (ENS)** | Ethereum Name Service (ENS) | **`rationalprocess.eth`** (5-year registration) | ~$25.00 one-off + ~$15 gas | Crypto (ETH) from Safe Multisig | **Ownership transferred to Safe Multisig** |
| **5** | **Academic Voter Gas Subsidies** | Ethereum Mainnet Relayer | **Gas Sponsor Fund** (~300 claims + ballots) | ~0.90 – 1.20 ETH (~$2,500 – $3,200) | Crypto (ETH) from Safe Multisig | EOA Relayer key restricted to contract calls |
| **6** | **Smart Contract & ZK Audit** | AuditOne Partner Ecosystem | **Security Audit Retainer** | ~$25,000 – $35,000 (Milestone bounty) | Crypto (USDC/ETH via Safe/Zodiac) | Milestone release upon audit sign-off |

---

## 3. Sovereign Storage Blueprint: Self-Hosted IPFS (Kubo) vs. Paid Commercial SaaS

### Direct Question: *"Can we deploy and operate IPFS without third-party paid subscriptions (e.g. Pinata, Infura, Filebase)?"*

### **Direct Answer: YES, 100% Absolutely.**

The system is designed with **zero dependency on proprietary cloud pinning services**.

### How Self-Hosted Sovereign IPFS Works:

1. **Zero-SaaS Daemon (Kubo):**
   The standard open-source IPFS implementation (**Kubo**, formerly `go-ipfs`) runs as a lightweight Docker container directly on our Linux VPS alongside the verification relayer.
   - It costs **$0.00/month** in third-party subscription fees.
   - Resource footprint: ~500 MB RAM, ~1 GB disk space, negligible CPU when idle.

2. **Swarm Peering & DHT Announcement:**
   When our deployment runner pins the web application or election manifest:
   ```bash
   ipfs add -r --cid-version 1 "Scientific_Vote_App_v5.html"
   ipfs pin add bafybeic01551220420867b4da197fa802eb7115k4ra
   ```
   Our self-hosted node announces the CID to the global decentralized libp2p Distributed Hash Table (DHT) over swarm port `4001`.

3. **Free Public Resolution via Decentralized Gateways:**
   Once published from our self-hosted node, any user or ENS gateway resolves the app for free through standard decentralized gateways:
   - `https://rationalprocess.eth.limo` *(Decentralized ENS-to-IPFS bridge, 100% free, community-funded)*
   - `https://ipfs.io/ipfs/<CID>`
   - `https://dweb.link/ipfs/<CID>`
   - `https://cloudflare-ipfs.com/ipfs/<CID>`

4. **Containerized Production Stack:**
   The self-hosted Kubo node is already packaged in the container stack:
   ```yaml
   ipfs-node:
     image: ipfs/kubo:v0.29.0
     container_name: zk-ipfs-node
     restart: unless-stopped
     ports:
       - "4001:4001"           # Swarm libp2p DHT peering
       - "4001:4001/udp"       # Swarm UDP QUIC
       - "127.0.0.1:5001:5001" # RPC API (Localhost only)
       - "127.0.0.1:8080:8080" # Local Gateway HTTP
     volumes:
       - ipfs-data:/data/ipfs
   ```

### Comparative Analysis: Self-Hosted Kubo vs. Commercial SaaS

| Dimension | Self-Hosted Kubo Daemon (Recommended) | Paid Commercial SaaS (Pinata/Infura) |
|:---|:---|:---|
| **Monthly SaaS Cost** | **$0.00** | $20.00 – $120.00 / month |
| **Vendor Lock-in** | **None** (Open-source Protocol Labs software) | High (Proprietary APIs & accounts) |
| **Sovereignty / Privacy** | **100% Sovereign** (Runs on our own hardware) | Subject to vendor Terms of Service |
| **ENS `.eth.limo` Compatibility** | **Identical** (Both use standard CIDv1 base32) | Identical |
| **Bandwidth Limits** | **Unlimited** (Bound only by host VPS bandwidth) | Metered per gigabyte |

---

## 4. Comprehensive Cost Schedule (CapEx vs. OpEx)

### Route A: Fully Sovereign Architecture (Recommended)
*Self-hosted IPFS + Dedicated Linux VPS + Cloudflare Worker + Rethink Vault Yield.*

| Category | Line Item | One-Time (CapEx) | Monthly (OpEx) | Annualized Total |
|:---|:---|:---:|:---:|:---:|
| **Compute** | Linux Cloud VPS (Hetzner / AWS Lightsail) | $0 | $15.00 | $180.00 |
| **Edge Routing** | Cloudflare Workers Paid | $0 | $5.00 | $60.00 |
| **Web3 Storage** | Self-Hosted Kubo IPFS Daemon | $0 | **$0.00** | **$0.00** |
| **ENS Domain** | `rationalprocess.eth` (5-Year Registration) | $40.00 | $0.00 | $8.00 / yr |
| **Smart Contract Gas** | Contract Deployment (Sepolia / L2 / Mainnet) | $35.00 – $120.00 | $0.00 | $120.00 |
| **Voter Gas Subsidy** | Relayer Gas Tank (300 Academic Ballots) | $0 | Variable (~$2,500) | ~$2,500.00 |
| **Security Audit** | Smart Contract & Circuit Audit | est. $30,000.00 | $0.00 | $30,000.00 |
| **TOTALS** | **Production Election Cycle** | **~$30,160.00** | **~$20.00 / mo** | **~$32,868.00** |

*Note: The ongoing annualized operating expense (excluding one-off security audits and gas subsidies) is less than **$250.00 per year**.*

---

## 5. Multi-Sig Treasury & Custody Architecture

To prevent unauthorized access, administrative key theft, or unilateral parameter tampering, all production assets are secured using a **Gnosis Safe 3-of-5 Multisig** configuration:

```
+----------------------------------------------------------------------------------------------------+
|                                    SAFE MULTISIG TREASURY TOPOLOGY                                 |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|    [ Rethink Finance Vault ]                                                                       |
|    (soonami4good.rethink.finance)                                                                  |
|                |                                                                                   |
|                v (Staking Yield: ~25 ETH / yr)                                                     |
|    +-----------------------------------------------------------+                                   |
|    |               GNOSIS SAFE 3-OF-5 MULTISIG                 |                                   |
|    |               (treasury.rationalprocess.eth)              |                                   |
|    +-----------------------------------------------------------+                                   |
|        |                  |                     |                                                  |
|        v                  v                     v                                                  |
|  [ ENS Domain Owner ] [ Smart Contract Admin ] [ Relayer Gas Tank ]                                |
|  - rationalprocess.eth - PanelRegistry.sol     - EOA Gas Relayer                                   |
|  - contenthash routing - Emergency Pause       - Auto-Rebalance                                    |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### Signer Composition (3-of-5 Quorum):
1. **Academic Representative:** Mila / Université de Montréal Governance Lead.
2. **Technical Architect:** Zero-Knowledge Cryptography Lead.
3. **Ecosystem Foundation Signer:** Foundance / Soonami Governance Committee Member.
4. **Community Steward:** Open Civic AI Alliance Delegate.
5. **Cold Emergency Key:** Hardware Security Module (YubiKey / Ledger) in institutional cold storage.

### Foundance DAO Governance & Zodiac Execution Mechanics:
**Foundance (`foundance.org`)** operates as the decentralized governance and community authorization layer for the soonami ecosystem:

1. **Ballot Mandate & Merkle Root Ratification:**
   Prior to deployment, the OpenAlex top-300 researcher snapshot hash and resulting Poseidon Merkle root are submitted as a formal **Foundance Governance Proposal (FGP)** on `foundance.org`. Staked token holders (`veSNI`) and scientific committee members vote to ratify the election parameters.
2. **Zodiac Reality & Scoped Roles Module:**
   The Gnosis Safe treasury is bound to a **Zodiac Module**. Multisig signers cannot arbitrarily alter contract parameters, divert funds, or trigger emergency circuit-breakers without a verified, passed Foundance DAO proposal.
3. **Milestone Bounty Disbursements:**
   Third-party contributors and security auditors are compensated via milestone bounties. Contributors submit delivery receipts (commit hashes, test run logs, and audit certificates). Foundance technical arbiters verify delivery, triggering atomic release of funds from the Safe treasury yield balance.

### Key Governance Policies:
* **Contract Administration:** The `PanelRegistry.sol` contract ownership is assigned directly to the Safe address.
* **ENS Content Record:** The ENS resolver's `contenthash` can only be updated by the Safe, ensuring that frontend updates to IPFS require multi-sig authorization.
* **Gas Relayer Rebalancing:** The Safe periodically funds the EOA relayer address with ~0.25 ETH tranches, enforcing an automated spend cap to prevent loss if the relayer server key is compromised.

---

## 6. Infrastructure & Governance Provisioning Checklist for Operations

Before triggering live voter outreach, the operations, governance, and finance teams must verify the following:

- [ ] **Foundance DAO Ratification:** Foundance Governance Proposal (FGP) formally passed on `foundance.org`, ratifying the OpenAlex 300-seat Merkle root and deployment parameters.
- [ ] **Zodiac Module Bound:** Gnosis Safe connected to Zodiac Roles/Reality module enforcing DAO consensus constraints.
- [ ] **Cloudflare Pro Plan:** Provisioned under corporate email with FIDO2 hardware 2FA.
- [ ] **VPS Instance:** Provisioned in EU/US region with SSH public key authentication (root password login disabled).
- [ ] **ENS Domain:** `rationalprocess.eth` registered for 5 years, with primary ownership transferred to Gnosis Safe.
- [ ] **DNS Records:** MX, SPF, DKIM, and DMARC records configured for `verify.rationalprocess.eth`.
- [ ] **RPC Endpoint:** Production RPC key provisioned with domain and IP whitelisting.
- [ ] **Relayer Gas Tank:** Relayer wallet funded with initial gas subsidy tranche.
- [ ] **Audit Sign-Off:** Formal security certificate issued and milestone released via Foundance DAO.

