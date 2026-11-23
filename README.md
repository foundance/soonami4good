# zk-cirket: AI Scientific Vote 2026

An audited, non-custodial decentralized epistemic governance protocol and ZK-Email ballot box built for the **2026 AI Scientific Vote** (soonami4good / The Rational Process).

---

## 🚀 Quick Navigation

* **Interactive Voting Web Application:** [Scientific_Vote_App_v5.html](./Scientific_Vote_App.html)
* **Audited Smart Contracts (v2.2):**
  * Groth16 Verifier (BN254 Pairing): [Groth16Verifier.sol](./zk-email/contracts/Groth16Verifier.sol)
  * Panel Registry & Ballot Box: [PanelRegistry.sol](./zk-email/contracts/PanelRegistry.sol)
* **Full Architectural Documentation:** [docs/README.md](./docs/README.md)
* **Docs:** [docs/SECURITY_AUDIT_AND_FIXES.md](./documentation)

---

## ⚡ Automated Test Suites

All cryptographic invariants, BN254 elliptic curve points, WebCrypto domain-separated signing, and EVM contract features are covered by automated tests:

```bash
# 1. On-Chain Smart Contract Tests (Foundry / Solc 0.8.24 via_ir)
forge test --root zk-email
# Result: 9 / 9 passed (100% success)

# 2. Cryptographic, WebCrypto & Replay Immunity Integration Tests
node zk-email/tests/integration_test.js
# Result: 50 / 50 passed (100% success)

# 3. DDD Deployment Engine Multi-Target Tests
node zk-email/tests/deployment_engine_test.js
# Result: 22 / 22 passed (100% success)
```
