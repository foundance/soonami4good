# Infrastructure & Financial Budget Request: 2026 AI Scientific Vote
## Decentralized Ballot Box (`zk-cirket`) Production Provisioning Guide
**Target Audience:** CFO, Finance Department, Operations & DevOps  
**Governance Framework:** Slide 12 & 13 Rethink Finance Vault Yield & Safe Multisig Model  
**Classification:** Operational Budget & Infrastructure Account Requisition  

---

## 1. Executive Summary & Funding Context

The **2026 AI Scientific Vote** operates on an autonomous, non-custodial decentralized infrastructure designed to evaluate frontier AI safety and capability across the top 300 global AI researchers (selected via Simon's Condorcet-consistent algorithm).

In accordance with **Slide 12 and 13 invariants**:
> *"You keep the asset. You contribute the yield. 1,000 ETH staked into the vault (~2.5% yield) -> ~25 ETH per year funding the work. No salaried staff, by design."*

All operational expenses (OpEx), gas sponsorship funds, security audit retainers, and infrastructure accounts are funded directly from **Rethink Finance staking vault yield** (`soonami4good.rethink.finance`) routed into a **Gnosis Safe 3-of-5 multisig** smart account.

---

## 2. Infrastructure Account Requisition Matrix

The finance and DevOps team must provision the following specific accounts and infrastructure resources:

| # | Infrastructure Service | Provider / Service | Tier / Plan | Estimated Cost | Payment Method | Custody / Access Requirement |
|:---|:---|:---|:---|:---|:---|:---|
| **1** | **Edge Mail Worker & DNS** | Cloudflare Inc. | **Workers Paid / Pro** | $5.00 / month ($60 / year) | Credit Card | Corporate email + Hardware 2FA |
| **2** | **Relayer & Self-Hosted IPFS VPS** | Hetzner / AWS Lightsail / OVH | **Linux Cloud VPS** (4 vCPU, 8GB RAM, 160GB NVMe) | ~$12.00 – $22.00 / month (~$144 – $264 / year) | Credit Card / Wire | SSH Key only; root login disabled |
| **3** | **Ethereum RPC Node Provider** | Alchemy / QuickNode / Infura | **Developer / Growth Tier** | $0 (Free) during testnet; $49 during election month | Credit Card | API Key restricted to broker IP |
| **4** | **Decentralized Domain (ENS)** | Ethereum Name Service (ENS) | **`rationalprocess.eth`** (5-year registration) | ~$25.00 one-off + ~$15 gas | Crypto (ETH) from Safe Multisig | **Ownership transferred to Safe Multisig** |
| **5** | **Academic Voter Gas Subsidies** | Ethereum Mainnet Relayer | **Gas Sponsor Fund** (~300 claims + ballots) | ~0.90 – 1.20 ETH (~$2,500 – $3,200) | Crypto (ETH) from Safe Multisig | EOA Relayer key restricted to contract calls |
| **6** | **Smart Contract & ZK Audit** | AuditOne Partner Ecosystem | **Security Audit Retainer** | ~$25,000 – $35,000 (Milestone bounty) | Crypto (USDC/ETH via Safe/Zodiac) | Milestone release upon audit sign-off |

---

## 3. Answering: "Can We Do IPFS Without Third-Party Paid Services?"

### **Direct Answer: YES, 100% Absolutely.**

You **do NOT need Pinata, Infura IPFS, Filebase, or any commercial paid pinning service**.

### How Self-Hosted Sovereign IPFS Works:

1. **Zero-SaaS Daemon (Kubo):**
   The open-source IPFS implementation (**Kubo**, formerly `go-ipfs`) runs directly as a Docker container side-by-side with our Rust Actix-Web broker on our existing Linux VPS.
   - It costs **$0.00/month** in third-party subscription fees.
   - It uses only ~500 MB of RAM and ~1 GB of disk space.

2. **Swarm Peering & DHT Announcement:**
   When our deployment runner pins the web application:
   ```bash
   ipfs add -r --cid-version 1 "Scientific Vote App.html"
   ipfs pin add bafybeic01551220420867b4da197fa802eb7115k4ra
   ```
   Our self-hosted node announces the CID to the global decentralized libp2p Distributed Hash Table (DHT) over swarm port `4001`.

3. **Free Public Resolution via Decentralized Gateways:**
   Once published from our self-hosted node, any user or ENS gateway resolves the app for free through standard decentralized gateways:
   - `https://rationalprocess.eth.limo` *(Decentralized ENS-to-IPFS bridge, 100% free)*
   - `https://ipfs.io/ipfs/<CID>`
   - `https://dweb.link/ipfs/<CID>`
   - `https://cloudflare-ipfs.com/ipfs/<CID>`

4. **Containerized Production Setup:**
   The self-hosted Kubo node is already integrated into the container stack in [docker-compose.yml](file:///d:/workspace/dapp/zk-circuit/zk-email/relayer/docker-compose.yml):
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

### Comparative Analysis: Self-Hosted Kubo vs. Commercial SaaS (Pinata)

| Dimension | Self-Hosted Kubo Daemon (Recommended) | Paid Commercial SaaS (Pinata/Infura) |
|:---|:---|:---|
| **Monthly SaaS Cost** | **$0.00** | $20.00 – $120.00 / month |
| **Vendor Lock-in** | **None** (Open-source Protocol Labs software) | High (Proprietary APIs & accounts) |
| **Sovereignty / Privacy** | **100% Sovereign** (Runs on our own hardware) | Subject to vendor Terms of Service |
| **ENS `.eth.limo` Compatibility** | **Identical** (Both use standard CIDv1 base32) | Identical |
| **Bandwidth Limits** | **Unlimited** (Bound only by host VPS bandwidth) | Metered per gigabyte |

---

## 4. Comprehensive Cost Schedule (Capex vs Opex)

### Option A: Fully Sovereign Architecture (Recommended)
*Self-hosted IPFS + Dedicated Linux VPS + Cloudflare Worker + Rethink Vault Yield.*

| Category | Line Item | One-Time (CapEx) | Monthly (OpEx) | Annualized Total |
|:---|:---|:---:|:---:|:---:|
| **Compute** | Linux Cloud VPS (Hetzner / AWS Lightsail) | $0 | $15.00 | $180.00 |
| **Edge Routing** | Cloudflare Workers Paid | $0 | $5.00 | $60.00 |
| **Web3 Storage** | Self-Hosted Kubo IPFS Daemon | $0 | **$0.00** | **$0.00** |
| **Web3 RPC** | Alchemy Ethereum RPC (Growth during election) | $0 | $49.00 *(1 mo)* | $49.00 |
| **Domains** | ENS `rationalprocess.eth` (5-Year Registration) | $40.00 | $0 | $8.00 / yr |
| **Smart Contracts** | CREATE2 Deployment Gas (Sepolia + Mainnet) | ~$120.00 | $0 | $120.00 |
| **Gas Subsidies** | Gas sponsorship for 300 academic ballots | ~$2,800.00 | $0 | $2,800.00 |
| **Subtotal (Infrastructure Only)** | — | **$2,960.00** | **$20.00** | **$3,217.00** |
| **Security Audit** | AuditOne Circuit & Contract Verification Bounty | $30,000.00 | $0 | $30,000.00 |
| **TOTAL REQUEST** | Funded from Rethink Vault Yield | **$32,960.00** | **$20.00** | **$33,217.00** |

*Note: The Rethink Finance 1,000 ETH staking vault produces ~25 ETH/year (equivalent to ~$65,000 – $80,000 USD at conservative ETH valuation), which completely covers this entire budget with a substantial safety surplus.*

---

## 5. Immediate Action Items for the Finance / Ops Team

Please execute the following 5 administrative onboarding steps:

1. **Create Cloudflare Account:**
   - Sign up at `cloudflare.com` and upgrade to the $5/month Workers Paid plan.
   - Generate an API Token with: `Zone.DNS:Edit`, `Workers Scripts:Edit`, `Pages:Edit`.
   - Add domain `rationalprocess.eth` (or web2 gateway mirror domain) to Cloudflare.
2. **Provision Linux Cloud VPS:**
   - Order an Ubuntu 24.04 LTS instance (e.g., Hetzner CPX21: 4 vCPU, 8GB RAM, 160GB NVMe at €13.50/mo, or AWS Lightsail 8GB instance at $20/mo).
   - Configure firewall rules: Open ports `80` (HTTP), `443` (HTTPS), `4001` (IPFS Swarm TCP/UDP), `22` (SSH restricted).
3. **Register ENS Domain & Transfer to Safe Multisig:**
   - Register `rationalprocess.eth` via `app.ens.domains` for 5 years.
   - **Crucial:** Set the ENS Controller and Registrant ownership to the Gnosis Safe 3/5 multisig address: `0x1234567890abcdef1234567890abcdef12345678`.
4. **Acquire RPC Endpoint Key:**
   - Sign up at `alchemy.com` or `quicknode.com`.
   - Create app for `Ethereum Mainnet` and `Sepolia Testnet`.
   - Provide HTTPS RPC URL to DevOps.
5. **Deposit Gas Sponsorship Float into Safe:**
   - Transfer 2.0 ETH from vault yield into the Gnosis Safe treasury to fund relayer gas subsidies during the election pilot.
