# Verification, Testing & Operations Manual: 2026 AI Scientific Vote
## Cryptographic Invariants, Automated Quality Gates & Live Monitoring Runbook

**Target Audience:** QA Engineers, Security Auditors, DevOps On-Call, Reliability Engineers  
**Classification:** Quality Assurance & Live Operations Runbook  
**Test Coverage Standard:** 100% Pass Rate Across Foundry & Cryptographic Matrix  
**Related Documents:** [03_ENGINEERING_DEPLOYMENT_GUIDE.md](file:///d:/workspace/dapp/zk-circuit/documentation/03_ENGINEERING_DEPLOYMENT_GUIDE.md)

---

## 1. Automated Test Suite Execution

The repository enforces a rigorous two-tier automated testing regime: smart contract unit tests in Foundry and a 50-step end-to-end cryptographic integration suite in Node.js.

### Tier 1: Foundry Smart Contract Unit Tests
The Foundry test suite validates Solidity state machine constraints, revert conditions, epoch boundaries, and point-at-infinity rejections.

* **Command:**
  ```bash
  forge test --root zk-email -vv
  ```
* **Expected Result:** `9 passed; 0 failed; 0 skipped`
* **Test Matrix Breakdown:**
  1. `test_CohortSeatSeparation()`: Validates that scientific seats (`0..299`) cannot be claimed in stakeholder or general lanes.
  2. `test_ConstantsAndSetup()`: Verifies deployment addresses, epoch identifiers, and curve constants.
  3. `test_RevertOnHighSOrZeroBoundsSignature()`: Ensures high-$s$ malleable ECDSA signatures are strictly rejected.
  4. `test_RevertOnInvalidCoiFlag()`: Enforces valid Conflict-of-Interest disclosure ranges.
  5. `test_RevertOnInvalidEpoch()`: Confirms replay protection across election years.
  6. `test_RevertOnInvalidMerkleRoot()`: Prevents unauthorized participant trees from claiming seats.
  7. `test_RevertOnInvalidSeatIdBounds()`: Checks boundary condition enforcement (`seatId < 300`).
  8. `test_VerifierRejectsPointAtInfinity()`: Checks curve pairing invariants against corrupted G1 inputs.
  9. `test_VerifierRejectsPointAtInfinityOnC()`: Checks point-at-infinity rejection on proof element $C$.

### Tier 2: End-to-End Cryptographic Integration Test
The Node.js integration runner tests the complete client-to-contract cryptographic pipeline, including WebCrypto key generation, domain separation, 213-byte packing, low-$s$ normalization, and BN254 curve equation compliance.

* **Command:**
  ```bash
  node zk-email/tests/integration_test.js
  ```
* **Expected Result:** `50/50 TESTS PASSED (100% SUCCESS)`
* **Test Suite Modules:**
  * **Test 1:** WebCrypto Ephemeral Keypair Generation (P-256 coordinates extraction, 65-byte uncompressed format).
  * **Test 2:** Zero-Secret Challenge Generation (Seat prefixing, public key binding, COI recording, mailto format).
  * **Test 3:** Canonical Ballot Hashing & 213-Byte Domain Separation (Exact byte packing, SHA-256 digest alignment, ECDSA signature generation & verification).
  * **Test 4:** Replay Attack Immunity (Cross-chain ID 11155111 rejection, cross-epoch rejection, seat swapping rejection, nullifier swapping rejection).
  * **Test 5:** Low-s Normalization & Strict (r, s) Range Bounds ($r, s \in (0, n)$, low-$s$ half-curve boundary enforcement).
  * **Test 6:** BN254 Curve Equation Invariant Verification (Verifies all 12 G1 points in `Groth16Verifier.sol` satisfy $y^2 \equiv x^3 + 3 \pmod q$).
  * **Test 7:** TreePoseidon32 Modulus Hashing (Validates Merkle tree limb compression).
  * **Test 8:** Salted Commitment & Nullifier Computation (Deterministic epoch derivation, Sybil resistance).
  * **Test 9:** Election Bundle Packaging (Formats self-contained `.ebundle.json` manifest).

---

## 2. Core Cryptographic Security Invariants

Every production deployment must guarantee the following four cryptographic invariants:

### Invariant 1: Low-$s$ ECDSA Signature Normalization
Standard ECDSA signatures $(r, s)$ are mathematically malleable: for any valid signature $(r, s)$, the tuple $(r, n - s)$ is also a valid signature over the same message.
* **Security Risk:** An attacker or malicious relayer could alter the transaction payload hash without invalidating the signature, corrupting election receipts.
* **Enforced Invariant:**
  Both the browser WebCrypto layer and the smart contract enforce canonical low-$s$ signatures:
  $$s \le \frac{n}{2}$$
  Where $n = \text{0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551}$. If $s > \frac{n}{2}$, the client automatically normalizes $s' = n - s$, and the contract reverts on high-$s$.

### Invariant 2: 213-Byte Domain-Separated Ballot Hashing
To prevent signature reuse across different smart contracts, testnets, or voting rounds, the message signed by the voter's browser is strictly structured into a 213-byte packed payload:
$$\text{Payload} = \text{DOMAIN\_SEPARATOR} \parallel \text{ballotHash} \parallel \text{nullifier} \parallel \text{publicSeatId} \parallel \text{lane} \parallel \text{coiFlag}$$
* **Payload Length:** Exactly 213 bytes.
* **Hash:** $\text{SHA-256}(\text{Payload}_{213\text{B}})$.
* **Result:** Any attempt to replay a signature on a different chain ID, under a different seat ID, or during a different election epoch results in an immediate cryptographic signature mismatch.

### Invariant 3: BN254 Elliptic Curve Invariant ($y^2 = x^3 + 3 \pmod q$)
The zero-knowledge Groth16 verification key points ($\alpha, \beta, \gamma, \delta, \text{IC}_0 \dots \text{IC}_{10}$) must lie on the prime-order BN254 (alt_bn128) curve:
$$y^2 \equiv x^3 + 3 \pmod{21888242871839275222246405745257275088696311157297823662689037894645226208583}$$
* **Automated Guard:** Test 6 in the integration suite parses every coordinate literal from `Groth16Verifier.sol` and verifies the quadratic residue equation modulo $q$.

### Invariant 4: Sybil Resistance via Poseidon Nullifiers
Each voter's unique nullifier is computed as:
$$\text{Nullifier} = \text{Poseidon}(\text{VoterSecret}, \text{SeatId}, \text{ElectionEpoch})$$
* Once submitted, the nullifier is stored in `mapping(bytes32 => bool) public nullifiers` in `PanelRegistry.sol`.
* Re-submission of the same nullifier reverts with `NullifierAlreadyUsed()`.
* Because $\text{VoterSecret}$ is never published, the nullifier proves uniqueness without revealing which researcher cast the vote.

---

## 3. Pre-Flight Production Checklist

Before announcing the election window to academic participants, the operations and governance teams must verify every item:

| Step | Verification Check | Command / Procedure | Pass Criteria |
|:---:|:---|:---|:---|
| **0** | **Foundance DAO Vote** | Check FGP proposal status on `foundance.org` | FGP Quorum reached; proposal APPROVED |
| **0b**| **Zodiac Module Bound**| `cast call $SAFE_ADDRESS "isModuleEnabled(address)"` | Zodiac Reality/Roles module returns true |
| **1** | **Unit Test Status** | `forge test --root zk-email` | 9/9 Tests Pass |
| **2** | **Crypto Integration** | `node zk-email/tests/integration_test.js` | 50/50 Tests Pass |
| **3** | **Contract Addresses** | `cast code $PANEL_REGISTRY_ADDRESS` | Bytecode matches build artifact |
| **4** | **Merkle Root Match** | `cast call $PANEL_REGISTRY_ADDRESS "merkleRoot()(bytes32)"` | Matches OpenAlex manifest hash approved in FGP |
| **5** | **Relayer Gas Balance** | `cast balance $RELAYER_ADDRESS` | Balance $\ge 0.50\text{ ETH}$ |
| **6** | **DNS MX Routing** | `dig MX verify.rationalprocess.eth` | Points to Cloudflare / VPS mail host |
| **7** | **DKIM Resolution** | `dig TXT 202610._domainkey.umontreal.ca` | University RSA-2048 key resolves |
| **8** | **IPFS Swarm DHT** | `ipfs dht findprovs $FRONTEND_CID` | Local VPS node listed as provider |
| **9** | **ENS Gateway** | `curl -I https://rationalprocess.eth.limo` | HTTP 200 OK |
| **10**| **Offline Bundle Drop**| Test drag-and-drop of `.ebundle.json` in v5 app | Shows "Valid Election Bundle Verified" |

---

## 4. Live Operations & Monitoring Runbook

During the active 14-day voting window, the on-call engineer should monitor the following telemetry:

### 1. Relayer Gas Tank Monitoring
* The relayer automatically submits transactions to `PanelRegistry.sol` on behalf of voters.
* If the balance drops below $0.20\text{ ETH}$, an automated alert triggers to rebalance from the Gnosis Safe multisig.
* Command to check balance:
  ```bash
  cast balance $RELAYER_ADDRESS --rpc-url $RPC_URL --ether
  ```

### 2. Inbound Mail Queue & Processing Time
* Normal processing latency from email dispatch to on-chain confirmation: **15 to 45 seconds**.
* If a researcher reports a delay:
  1. Check relayer logs: `docker logs --tail 100 -f zk-email-relayer`.
  2. Confirm institutional mail server sent DKIM headers: `grep "DKIM-Signature" /var/log/mail.log`.
  3. Ensure sending domain matches manifest (e.g. `@umontreal.ca`).

### 3. Rate Limiting & Anti-Spam Safeguards
* Inbound email verification is rate-limited to **5 challenge requests per IP / sending domain per minute** to prevent mail queue flooding.
* Non-whitelisted domains submitting to the scientific lane are dropped immediately at the edge worker.

---

## 5. Post-Election Ballot Auditing & Consensus Tallying

Once the voting deadline passes (`block.timestamp >= votingDeadline`):

1. **Download the Public Election Archive:**
   The relayer publishes all sealed `.ebundle.json` manifests to a public IPFS directory:
   ```bash
   ipfs get bafybeielectionarchive2026finalballots
   ```

2. **Run Independent Offline Tally:**
   Anyone can run the open-source Condorcet consensus calculator:
   ```bash
   node zk-email/scripts/calculate_condorcet_winner.js \
     --archive-dir ./final_ballots \
     --contract $PANEL_REGISTRY_ADDRESS \
     --rpc-url $RPC_URL
   ```

3. **Verify Every Single Ballot:**
   - Evaluates the Groth16 zero-knowledge proof validity.
   - Verifies the WebCrypto ECDSA signature over the 213-byte packed domain hash.
   - Computes Simon's Condorcet matrix across the 5 statement positions.
   - Publishes the final scientific consensus report with cryptographic proof receipts attached.
