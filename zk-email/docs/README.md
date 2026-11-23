# zk-cirket Architecture & Specification Documentation
## AI Scientific Vote 2026: ZK-Email Ballot Box

Welcome to the technical documentation repository for the **zk-cirket** decentralized voting application developed for the **2026 AI Scientific Vote** (soonami4good / The Rational Process).

This documentation outlines the complete, non-custodial, trustless cryptographic identity binding, ballot submission, smart contract verification, and deployment architecture based on Simon's 300 AI Researcher selection algorithm and ZK-Email DKIM verification.

---

## Production Applications & Smart Contracts

| Component | Path / Location | Description | Status |
|:---|:---|:---|:---|
| **Production Voting WebApp** | [Scientific_Vote_App_v5.html](file:///d:/workspace/dapp/zk-circuit/Scientific_Vote_App_v5.html) | Single-Page Application with 4-step wizard, interactive 10-point Position & 5-point Weight scales, reversed strong weight animation with contrast inversion, real canvas QR code generation, 213-byte WebCrypto ECDSA SHA-256 signing, and offline drag-and-drop bundle inspector. | **Production Ready** |
| **ZK Verifier Contract** | [Groth16Verifier.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/Groth16Verifier.sol) | Audited v2.2 Groth16 pairing verifier over BN254. All 12 $\mathbb{G}_1$ constants (`ALPHA`, `IC0..IC10`) are algebraically verified on-curve points satisfying $y^2 \equiv x^3 + 3 \pmod{Q\_MOD}$, with toxic-waste distinct quadratic twist $\text{DELTA} \neq \text{GAMMA}$, point-at-infinity $(0,0)$ rejection, and gas-optimized zero-scalar multiplication skipping. | **Audited (v2.2)** |
| **Panel Registry Contract** | [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol) | Audited v2.2 registry enforcing 213-byte `sha256(abi.encodePacked(...))` domain separation (aligned with browser WebCrypto ECDSA SHA-256), cohort-separated seat tracking (`isCohortSeatClaimed`), strict $(r, s)$ bounds & low-$s$ malleability checks, 300-seat scientific cap, and dual-mode EIP-7212 fallback on L1 Mainnet. | **Audited (v2.2)** |

---

## Documentation Index

| Document | Title | Description |
|:---|:---|:---|
| [01_CONTEXT_AND_REQUIREMENTS.md](file:///d:/workspace/dapp/zk-circuit/docs/01_CONTEXT_AND_REQUIREMENTS.md) | **Context & Requirements** | Slide 10/11/13 security invariants, Simon's selection algorithm, the AI Zero Financial Interest paradox (Vote 1 vs Vote 2), and hyperauthorship decay. |
| [02_CRYPTOGRAPHIC_STATE_MACHINE.md](file:///d:/workspace/dapp/zk-circuit/docs/02_CRYPTOGRAPHIC_STATE_MACHINE.md) | **Cryptographic State Machine** | The Zero-Secret `mailto:` challenge flow, salted Poseidon commitment tree, derived seat nullifiers, 213-byte domain separation, and on-chain state machine gates. |
| [03_CIRCUIT_ARCHITECTURE.md](file:///d:/workspace/dapp/zk-circuit/docs/03_CIRCUIT_ARCHITECTURE.md) | **Circuit Architecture** | Circom 2.1+ (Groth16) and Noir (UltraHonk) circuit specs, RSA BigInt arithmetic, ZK-regex parsing, and Merkle inclusion proofs. |
| [04_CLIENT_WEBCRYPTO_BALLOT_BOX.md](file:///d:/workspace/dapp/zk-circuit/docs/04_CLIENT_WEBCRYPTO_BALLOT_BOX.md) | **Client WebCrypto, UI/UX & Ballot Box** | Detailed architecture of [Scientific_Vote_App_v5.html](file:///d:/workspace/dapp/zk-circuit/Scientific_Vote_App_v5.html): position scale contrast inversion engine, canvas QR generator, 213-byte WebCrypto ECDSA SHA-256 signing, and offline bundle inspector. |
| [05_RELAYER_AND_DKIM_INFRASTRUCTURE.md](file:///d:/workspace/dapp/zk-circuit/docs/05_RELAYER_AND_DKIM_INFRASTRUCTURE.md) | **Relayer & DKIM Infrastructure** | Cloudflare Email Worker, Actix-Web SSE broker, DNSSEC chain snapshotting, and DKIM key rotation management. |
| [06_FALLBACK_MITIGATION_ORCID.md](file:///d:/workspace/dapp/zk-circuit/docs/06_FALLBACK_MITIGATION_ORCID.md) | **ORCID Fallback Mitigation** | Deterministic secondary verification flow for universities with non-compliant DKIM subdomains via ORCID and OpenAlex. |
| [07_DEPLOYMENT_ENGINE.md](file:///d:/workspace/dapp/zk-circuit/docs/07_DEPLOYMENT_ENGINE.md) | **Deployment Engine (DDD/SOLID/DRY)** | Unified single `DeploymentTarget` interface, cross-cutting orchestrator, and adapters for IPFS, Cloudflare, and Ethereum Safe/Zodiac. |
| [08_IMPLEMENTATION_ROADMAP_AND_BOUNTIES.md](file:///d:/workspace/dapp/zk-circuit/docs/08_IMPLEMENTATION_ROADMAP_AND_BOUNTIES.md) | **Roadmap & Bounties** | Phased 10-week execution schedule, Safe/Zodiac bounty disbursements via Rethink Finance vault yield, and AuditOne audit milestones. |
| [09_VOTER_AUTHENTICATION_AND_LOGIN_PROVIDERS.md](file:///d:/workspace/dapp/zk-circuit/docs/09_VOTER_AUTHENTICATION_AND_LOGIN_PROVIDERS.md) | **Voter Authentication & Login Providers** | Comprehensive breakdown of Google, ORCID, eduGAIN, and ZK-Email verification mechanics. |
| [SECURITY_AUDIT_AND_FIXES.md](file:///d:/workspace/dapp/zk-circuit/docs/SECURITY_AUDIT_AND_FIXES.md) | **Security Audit & Fixes** | Comprehensive vulnerability audit report covering `SV-01` through `SV-18`, BN254 curve validity, RIP-7212 P-256 alignment, and side-channel hardening. |
| [DEPLOYMENT_AND_TESTING_GUIDE.md](file:///d:/workspace/dapp/zk-circuit/docs/DEPLOYMENT_AND_TESTING_GUIDE.md) | **Deployment & Testing Guide** | End-to-end production operational runbook for On-Chain EVM, IPFS, Cloudflare Workers, and Rust broker deployment. |
| [FINANCIAL_INFRASTRUCTURE_REQUEST.md](file:///d:/workspace/dapp/zk-circuit/docs/FINANCIAL_INFRASTRUCTURE_REQUEST.md) | **Financial & Infrastructure Request** | Executive budgeting and account requisition sheet for the financial team, plus self-hosted IPFS guide. |
| [RETHINK_AND_FOUNDANCE_DAO_INTEGRATION.md](file:///d:/workspace/dapp/zk-circuit/docs/RETHINK_AND_FOUNDANCE_DAO_INTEGRATION.md) | **Rethink & Foundance DAO Integration** | Integration architecture across rethink.finance staking vaults, Foundance DAO governance, and Safe/Zodiac. |

---

## Verification & Automated Test Suites

The repository maintains automated test coverage across cryptographic field arithmetic, smart contract EVM compilation, and deployment pipelines:

```bash
# 1. On-Chain Smart Contract Unit Tests (Foundry / Solc 0.8.24 via_ir)
forge test --root zk-email
# Result: 9 / 9 passed (100% success)
# Validates constant setup, (0,0) point-at-infinity rejection, cohort seat isolation,
# invalid Merkle root / epoch / seat / COI reverts, and low-s / zero-bound signature enforcement.

# 2. Cryptographic, WebCrypto & Replay Immunity Integration Test Suite
node zk-email/tests/integration_test.js
# Result: 50 / 50 passed (100% success)
# Validates P-256 keygen, zero-secret challenge creation, 213-byte packed domain separation,
# cross-chain/epoch replay immunity, low-s normalization, and live BN254 on-curve invariants.

# 3. DDD Deployment Engine Test Suite
node zk-email/tests/deployment_engine_test.js
# Result: 22 / 22 passed (100% success)
# Validates IPFS, Cloudflare, and EVM multi-target atomic deployments, LIFO rollbacks, and HMAC audit trails.
```

---

## System Repository Layout

```
zk-circuit/
├── Scientific_Vote_App_v5.html              # Production interactive Single-Page Application
├── foundry.toml                             # Foundry workspace build configuration (via_ir = true)
├── docs/                                    # Architectural specifications (.md)
│   ├── README.md                            # Documentation master index
│   ├── 01_CONTEXT_AND_REQUIREMENTS.md       # Requirements & Simon's algorithm specs
│   ├── 02_CRYPTOGRAPHIC_STATE_MACHINE.md    # Cryptographic state machine & on-chain gates
│   ├── 03_CIRCUIT_ARCHITECTURE.md           # Circom & Noir circuit specifications
│   ├── 04_CLIENT_WEBCRYPTO_BALLOT_BOX.md    # Client WebCrypto, UI/UX & ballot box specs
│   ├── 05_RELAYER_AND_DKIM_INFRASTRUCTURE.md# Relayer & SSE broker infrastructure
│   ├── 06_FALLBACK_MITIGATION_ORCID.md      # ORCID fallback bridging
│   ├── 07_DEPLOYMENT_ENGINE.md              # DDD multi-target deployment architecture
│   ├── 08_IMPLEMENTATION_ROADMAP_AND_BOUNTIES.md # Phased roadmap & Rethink bounties
│   ├── 09_VOTER_AUTHENTICATION_AND_LOGIN_PROVIDERS.md # Auth provider mechanics
│   ├── SECURITY_AUDIT_AND_FIXES.md          # Security audit report (SV-01 through SV-18)
│   ├── DEPLOYMENT_AND_TESTING_GUIDE.md      # Production runbook
│   ├── FINANCIAL_INFRASTRUCTURE_REQUEST.md  # Financial & infrastructure requisition
│   └── RETHINK_AND_FOUNDANCE_DAO_INTEGRATION.md # Vault governance integration
├── zk-email/
│   ├── contracts/                           # Audited Solidity smart contracts (v2.2)
│   │   ├── Groth16Verifier.sol              # Audited BN254 Groth16 proof verifier
│   │   └── PanelRegistry.sol                # Audited voter registry & ballot box
│   ├── test/                                # Foundry Solidity unit tests
│   │   └── PanelRegistryTest.t.sol          # 9 on-chain invariant test cases
│   ├── tests/                               # Node.js automated test suites
│   │   ├── integration_test.js              # 50 cryptographic integration tests
│   │   └── deployment_engine_test.js        # 22 deployment engine tests
│   ├── circuits/                            # Circom & Noir ZK-Email circuits
│   ├── client/                              # WebCrypto key manager & BallotBox controller
│   ├── config/                              # Manifest & parameter configs
│   ├── deployment/                          # DDD single-port deployment engine & adapters
│   └── relayer/                             # Actix-Web broker & Cloudflare worker
└── project brief/                           # Core project PDFs and onboarding brief
```
