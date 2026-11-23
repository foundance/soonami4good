# 03. Circuit Architecture & Formal Constraints

## 1. Circuit Overview

The ZK-Email verification circuit parses RFC 5322 email headers and proves four statements in zero knowledge:
1. **Header Integrity:** The raw header bytes hash to the value signed by the institutional RSA key.
2. **Signature Authenticity:** The RSA PKCS#1 v1.5 signature is valid against the university's public modulus $N$.
3. **Identity Binding:** The extracted `From:` header matches the committed email address for `seat_id`, and `Subject:` binds the ephemeral `voter_pubkey` and `coi_flag`.
4. **Cohort Membership:** The leaf corresponding to `seat_id` exists in the published `panel_merkle_root`.

Implementation paths:
- **Groth16 / SnarkJS (Circom 2.1+):** [email_ballot_verifier.circom](file:///d:/workspace/dapp/zk-circuit/zk-email/circuits/circom/email_ballot_verifier.circom)
- **UltraHonk / Barretenberg (Noir):** [main.nr](file:///d:/workspace/dapp/zk-circuit/zk-email/circuits/noir/src/main.nr)

---

## 2. Circuit Parameters & Signal Interface

| Signal | Direction | Visibility | Constraints & Description |
|:---|:---|:---|:---|
| `panelMerkleRoot` | Input | **Public** | Root of the 300 AI scientists Poseidon tree ($depth = 9$). |
| `dkimPubkeyHash` | Input | **Public** | Poseidon commitment of the university's RSA modulus limbs. |
| `voterPubkey[4]` | Input | **Public** | Ephemeral public key generated in voter's browser (64-bit chunks). |
| `seatId` | Input | **Public** | Claimed seat index $[0..299]$. |
| `coiFlag` | Input | **Public** | Conflict-of-interest declaration ($0 = \text{Vote 1}, 1 = \text{Vote 2}$). |
| `electionEpoch` | Input | **Public** | Active voting epoch identifier (e.g., `202610`). |
| `seatNullifier` | Output | **Public** | Derived double-spending prevention nullifier. |
| `rawHeaders[1024]` | Input | **Private** | Canonicalized (`relaxed/relaxed`) email headers. |
| `rawHeadersLength` | Input | **Private** | Byte length of active header stream ($\le 1024$). |
| `rsaModulus[32]` | Input | **Private** | 2048-bit RSA public modulus split into 32 64-bit limbs. |
| `rsaSignature[32]` | Input | **Private** | 2048-bit RSA signature limbs from `b=` tag. |
| `emailCanonicalHash` | Input | **Private** | SHA-256 pre-image digest of canonical lowercase email. |
| `domainHash` | Input | **Private** | Poseidon hash of the institutional domain. |
| `merklePathElements[9]` | Input | **Private** | Sibling node hashes on the Merkle branch. |
| `merklePathIndices[9]` | Input | **Private** | Binary direction flags ($0 = \text{left}, 1 = \text{right}$). |

---

## 3. Mathematical & Cryptographic Constraints

### 3.1 RSA BigInt Verification (PKCS#1 v1.5)
Let $N$ be the 2048-bit RSA modulus and $e = 65537$. The signature $S$ is verified over message digest $H = \text{SHA256}(\text{rawHeaders})$:

$$S^e \equiv \text{EMSA-PKCS1-v1_5-ENCODE}(H) \pmod N$$

In Circom, arithmetic over large numbers outside the BN254 scalar field is computed using the `BigMod` and `RSAVerify64` modules with 64-bit chunking (32 chunks for 2048-bit keys, 64 chunks for 4096-bit keys).

### 3.2 Canonicalization & CRLF Injection Mitigation
Audits of ZK-Email implementations (e.g., Consensys Diligence review of `zk-email-noir`) identified header injection vulnerabilities when regex engines fail to strictly delimit boundaries.
- **Vulnerability:** An attacker crafts injected headers (`From: <malicious@attacker.com>\r\nFrom: <victim@mit.edu>`).
- **Mitigation:** The regex compiler strictly verifies that `From:` and `Subject:` are prefixed by CRLF (`\r\n`) or the start-of-buffer boundary, and validates that the domain in the `From:` header matches the `d=` tag in the signed `DKIM-Signature:` header.

### 3.3 Merkle Inclusion Verification
For each level $k \in [0..8]$, the parent hash is computed conditionally:
$$\text{left}_k = \text{indices}[k] \cdot (\text{elements}[k] - \text{current}_k) + \text{current}_k$$
$$\text{right}_k = \text{indices}[k] \cdot (\text{current}_k - \text{elements}[k]) + \text{elements}[k]$$
$$\text{current}_{k+1} = \text{Poseidon}(\text{left}_k, \text{right}_k)$$
$$\text{current}_9 \equiv \text{panelMerkleRoot}$$
