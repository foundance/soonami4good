# 2026 AI Scientific Vote: Documentation Suite
## Production Architecture, Infrastructure Blueprint & Sovereign Deployment Manual

Welcome to the official documentation suite for the **2026 AI Scientific Vote** (`zk-circuit`). This documentation provides a comprehensive, non-custodial architecture blueprint for both executive leadership and engineering teams.

---

## 1. Documentation Index & Reading Paths

```
+----------------------------------------------------------------------------------------------------+
|                                    DOCUMENTATION SUITE SITEMAP                                     |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  EXECUTIVE & OPERATIONS TRACK                        ENGINEERING & AUDIT TRACK                     |
|                                                                                                    |
|  [01_EXECUTIVE_SYSTEM_OVERVIEW.md]                   [03_ENGINEERING_DEPLOYMENT_GUIDE.md]          |
|  - High-level flow & voter journey                   - 3 deployment routes (100% sovereign)        |
|  - 3 Cohorts: Scientists, Industry, Public           - Smart contract deployment & Merkle setup    |
|  - Zero-custody trust model                          - Edge mail worker & relayer orchestration    |
|  - Strategic impact & timeline                       - Deterministic IPFS swarm pinning            |
|                   |                                                     |                          |
|                   v                                                     v                          |
|  [02_INFRASTRUCTURE_AND_BUDGET_BLUEPRINT.md]        [04_VERIFICATION_TESTING_MANUAL.md]           |
|  - Account requisition matrix                        - 50/50 cryptographic test suite execution    |
|  - CapEx vs OpEx financial schedule                  - Low-s, 213B domain separation, BN254 checks |
|  - Sovereign IPFS (Kubo) vs paid SaaS                - Pre-flight checklist & live monitoring      |
|  - Rethink Finance yield & Gnosis Safe               - Post-election Condorcet consensus tally     |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### Choose Your Reading Path:

* **For Executives, Board Members, & Directors:**
  1. Start with [01_EXECUTIVE_SYSTEM_OVERVIEW.md](file:///d:/workspace/dapp/zk-circuit/documentation/01_EXECUTIVE_SYSTEM_OVERVIEW.md) to understand the deliberation model, the 3 participant lanes, and why researchers can safely participate without identity or privacy leaks.
  2. Proceed to [02_INFRASTRUCTURE_AND_BUDGET_BLUEPRINT.md](file:///d:/workspace/dapp/zk-circuit/documentation/02_INFRASTRUCTURE_AND_BUDGET_BLUEPRINT.md) for the account requisition matrix, annual financial projections, and the Gnosis Safe 3-of-5 treasury governance model.

* **For Developers, DevOps, & Security Auditors:**
  1. Start with [03_ENGINEERING_DEPLOYMENT_GUIDE.md](file:///d:/workspace/dapp/zk-circuit/documentation/03_ENGINEERING_DEPLOYMENT_GUIDE.md) to review the three deployment routes—starting from **Route 1: 100% Self-Sovereign (Kubo IPFS + local relayer + zero SaaS)**—and step-by-step contract deployment.
  2. Proceed to [04_VERIFICATION_TESTING_AND_OPERATIONS_MANUAL.md](file:///d:/workspace/dapp/zk-circuit/documentation/04_VERIFICATION_TESTING_AND_OPERATIONS_MANUAL.md) for automated test commands, cryptographic security invariants, pre-flight checklists, and live monitoring runbooks.

---

## 2. Core System Properties at a Glance

| Pillar | Technical Mechanism | Guarantee to Voters & Public |
|:---|:---|:---|
| **Identity Genesis** | W3C WebCrypto API & WebAuthn / Passkey | Private keys remain isolated in browser memory or the device's Secure Enclave (Apple TouchID / FaceID). |
| **Eligibility Proof** | Institutional RSA-2048 DKIM + Groth16 zk-SNARK | Proves university affiliation without revealing the voter's identity, inbox contents, or email body. |
| **Ballot Security** | 213-Byte Domain Separation & Low-$s$ Normalization | Mathematically immunizes the election against signature malleability, cross-chain replays, and epoch reuse. |
| **Storage Sovereignty** | Self-Hosted Kubo IPFS Daemon + libp2p DHT | $0/month in third-party SaaS fees; 100% censorship-resistant global distribution via ENS (`.eth.limo`). |
| **Treasury & DAO Governance** | Rethink Finance Vault + Foundance DAO + Gnosis Safe (Zodiac) | Funded by non-custodial staking yield (~25 ETH/yr); parameters & Merkle roots ratified via Foundance Proposals (FGPs). |

---

## 3. Quick-Start Commands for Developers

```bash
# 1. Run all smart contract unit tests (Foundry)
forge test --root zk-email -vv

# 2. Run the full cryptographic integration suite (50/50 test matrix)
node zk-email/tests/integration_test.js

# 3. Serve the production frontend locally
npx serve . -p 8085
# Open in browser: http://127.0.0.1:8085/Scientific_Vote_App_v5.html

# 4. Pin the web application to a local/sovereign IPFS node
ipfs add -r --cid-version 1 Scientific_Vote_App_v5.html zk-prover.worker.js
```
