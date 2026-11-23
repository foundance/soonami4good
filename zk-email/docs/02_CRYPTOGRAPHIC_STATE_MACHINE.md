# 02. Cryptographic State Machine & Pipeline

## 1. The Zero-Secret `mailto:` Challenge Architecture

To eliminate trusted intermediaries without subjecting academic panellists to client-side proving friction, the system deploys an **ephemeral in-browser keypair** coupled with an **outbound DKIM signature challenge**.

```
[Scientist Browser]                    [University MTA]            [Cloudflare Worker]         [Actix-Web Broker]         [Smart Contract / IPFS]
        │                                     │                            │                           │                             │
 1. Generate (sk, pk)                         │                            │                           │                             │
    via WebCrypto in IndexedDB                │                            │                           │                             │
        │                                     │                            │                           │                             │
 2. User clicks "mailto:" or scans QR         │                            │                           │                             │
    To: verify-<nonce>@...                    │                            │                           │                             │
    Subject: CLAIM:<seat>:<pk>:<coi> ────────>│                            │                           │                             │
                                              │ 3. MTA signs outbound mail │                           │                             │
                                              │    DKIM RSA-SHA256         │                           │                             │
                                              │───────────────────────────>│                           │                             │
                                                                           │ 4. Extracts headers       │                             │
                                                                           │    POST /push/<nonce>     │                             │
                                                                           │──────────────────────────>│                             │
                                                                                                       │ 5. Streams headers via SSE  │
 6. Browser receives headers <─────────────────────────────────────────────────────────────────────────│                             │
        │                                                                                                                            │
 7. Prover generates SNARK (Groth16/UltraHonk)                                                                                       │
    - Validates RSA DKIM signature                                                                                                   │
    - Leaf_i ∈ panelMerkleRoot                                                                                                       │
    - Extracts voterPubkey & verifies pk0..pk3 match                                                                                 │
        │                                                                                                                            │
 8. Browser signs 213B domain payload with sk ──────────────────────────────────────────────────────────────────────────────────────>│ 9. Immutable Bundle
                                                                                                                                          (Proof + Signed Ballot +
                                                                                                                                           DNSSEC Snapshot)
```

### 1.1 Non-Custodial Security Proof
- **Theorem:** Neither the Cloudflare Email Worker, the Actix-Web SSE broker, nor any third-party SNARK relayer can forge a vote for scientist $i$.
- **Proof:**
  1. The scientist's browser generates an ephemeral keypair $(sk, pk)$ using the WebCrypto API with `extractable: false`. The secret key $sk$ never leaves device storage.
  2. The university MTA cryptographically seals $pk$ into the email `Subject:` header using the institution's private RSA signing key $SK_{\text{DKIM}}$ under `h=from:to:subject:date`.
  3. The ZK circuit verifies that the signature from $PK_{\text{DKIM}}$ authenticates $pk$, and proves that the `From:` address matches seat $i$ in `panelMerkleRoot`.
  4. Casting a valid ballot requires an ECDSA P-256 digital signature verifiable against $pk$. Because an adversary does not possess $sk$, they cannot construct a valid ballot payload matching $pk$.

---

## 2. Salted Poseidon Merkle Tree Construction

Publishing plaintext academic emails or unsalted SHA-256 digests on-chain exposes researchers to automated dictionary-attack harvesting by spammers and bots.

The protocol constructs a 9-depth binary Poseidon Merkle tree over 300 leaves ($2^9 = 512$ capacity). Each leaf is defined as:

$$\text{Leaf}_i = \text{Poseidon}(\text{seat\_id}_i, \text{SHA256}(\text{canonical\_email}_i), \text{domain\_hash}_i)$$

Where:
- $\text{seat\_id}_i \in [0..299]$: The deterministic seat index resulting from Simon's Condorcet selection ranking.
- $\text{canonical\_email}_i$: The RFC 5321 lowercase, stripped email address of the researcher.
- $\text{domain\_hash}_i$: $\text{Poseidon}(\text{canonical\_domain}_i)$, binding the institution (e.g., `umontreal.ca`).

The resulting `panelMerkleRoot` is stored as an immutable constant in [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol) and pinned to IPFS.

---

## 3. Derived Seat Nullifier Formulation

To enforce the constraint of **one ballot per claimed seat** while preserving zero-knowledge anonymity and preventing cross-election tracking, the circuit deterministically computes and outputs a nullifier:

$$\text{SeatNullifier} = \text{Poseidon}(\text{seat\_id}, \text{election\_epoch}, \text{dkim\_pubkey\_hash})$$

- $\text{election\_epoch}$: Integer identifier for the active vote cycle (e.g., `202610`).
- $\text{dkim\_pubkey\_hash}$: Poseidon commitment to the university's active RSA public key modulus $N$.

On-chain, `PanelRegistry.sol` tracks `isNullifierSpent[seatNullifier] = true`. Re-submissions of the same nullifier within the same epoch revert with `NullifierAlreadySpent(nullifier)` (SV-03).

---

## 4. In-Browser Ballot Signing & 213-Byte Domain Separation (SV-11, SV-15)

### 4.1 Canonical Ballot Serialization & Digest
When the voter casts their ballot, the answers and rationales across the 5 statements are structured into a canonical JSON payload:

```json
{
  "domain": {
    "name": "PanelRegistry.BallotVote.v1",
    "chainId": 1,
    "verifyingContract": "0x4b7ec3b48f95c527e59b9643d9cc2cbe74f4c9c1",
    "electionEpoch": 202610,
    "merkleRoot": "0x1d8f4a92c3e084b17f99102a45b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e"
  },
  "panel": "soonami4good-ai-2026-q4",
  "lane": "sci",
  "is_anonymous": false,
  "public_seat_id": 43,
  "voter_ephemeral_pubkey": "0x04...",
  "votes": [
    {"statement_id": "ai-01", "position": 7, "strength_weight": "con", "scientific_rationale": "Empirical scaling saturation..."},
    {"statement_id": "ai-02", "position": 6, "strength_weight": "mod", "scientific_rationale": "Capital substitution window..."},
    {"statement_id": "ai-03", "position": 4, "strength_weight": "str", "scientific_rationale": "Formal safety proofs unproven..."},
    {"statement_id": "ai-04", "position": 2, "strength_weight": "sl",  "scientific_rationale": null},
    {"statement_id": "ai-05", "position": 9, "strength_weight": "str", "scientific_rationale": "Frontier cluster treaties..."}
  ],
  "sealed_at_utc": "2026-10-30T10:00:00.000Z"
}
```

The payload keys are lexicographically sorted via `canonicalJson()` and hashed via $\text{SHA-256}$ to yield `ballotHash`.

### 4.2 213-Byte Domain Separation Payload
To prevent cross-chain, cross-contract, and cross-epoch replay attacks, while aligning with WebCrypto's internal $\text{SHA-256}$ hashing:
$$\text{PackedData} = \text{BALLOT\_DOMAIN\_PREFIX}_{32\text{B}} \parallel \text{chainId}_{32\text{B}} \parallel \text{contract}_{20\text{B}} \parallel \text{epoch}_{32\text{B}} \parallel \text{nullifier}_{32\text{B}} \parallel \text{publicSeatId}_{32\text{B}} \parallel \text{coiFlag}_{1\text{B}} \parallel \text{ballotHash}_{32\text{B}}$$

Total length $= 32 + 32 + 20 + 32 + 32 + 32 + 1 + 32 = 213\text{ bytes}$ (426 hex characters).

* **Browser WebCrypto:** Signs `PackedData` with `{ name: "ECDSA", hash: { name: "SHA-256" } }`. WebCrypto automatically hashes `PackedData` with $\text{SHA-256}$ and signs the resulting 32-byte digest over P-256.
* **On-Chain Solidity:** Computes `bytes32 domainSeparatedHash = sha256(abi.encodePacked(...))` over those exact 8 fields.
* **Result:** The on-chain RIP-7212 precompile `0x0100` verifies the signature over `domainSeparatedHash`, guaranteeing cryptographic equivalence with 0 mismatches.

---

## 5. On-Chain State Machine & Verification Architecture (v2.2)

The on-chain verification and state transition logic is executed by [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol) and [Groth16Verifier.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/Groth16Verifier.sol).

```
                      claimAndCastBallot(...)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [PanelRegistry.sol]              [Groth16Verifier.sol]
      1. Invariant Validation          1. F_q range checks (< Q_MOD)
         - Merkle Root == panelRoot    2. Reject point-at-infinity (0,0)
         - Epoch == electionEpoch      3. F_r range checks (< R_MOD)
         - DKIM Hash in Whitelist      4. Linear combination:
         - SeatId <= 300                  vk_x = IC_0 + Σ input[i] * IC_{i+1}
         - CoiFlag <= 1                   (Skips ecMul if input[i] == 0)
         - Vote 1 Cap < 300            5. 4-pair ecPairing (0x08):
         - Nullifier NOT spent            e(-A, B) * e(ALPHA, BETA) *
         - isCohortSeatClaimed == false   e(vk_x, GAMMA) * e(C, DELTA) == 1
      2. Key Limb Binding (pk0..pk3)             │
      3. ECDSA (r, s) Range & Low-s              │
      4. WebCrypto Domain Hash SHA-256           │
      5. RIP-7212 (0x0100) / Fallback            │
                 │                               │
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                     [Commit State Transition]
                     - isNullifierSpent[nullifier] = true
                     - isCohortSeatClaimed[coiFlag][seatId] = true
                     - totalScientificBallots / totalStakeholderBallots += 1
                     - Emit SeatClaimedAndBallotCast event
```

### 5.1 Verification Checklist & Invariant Gates

1. **Voting Window Check:** `block.timestamp <= votingClosesAt`.
2. **Public Input Invariants (SV-07):**
   - `publicInputs[0] == panelMerkleRoot`
   - `publicInputs[8] == electionEpoch`
   - `isValidDkimKeyHash[publicInputs[1]] == true`
   - `publicInputs[6] <= MAX_PANEL_SEATS` (300)
   - `publicInputs[7] <= 1` (`rawCoiFlag`)
3. **Cohort Separation & 300-Seat Cap (SV-12, SV-17):**
   - If `coiFlag == 0` (Scientific Vote 1), verifies `totalScientificBallots < MAX_PANEL_SEATS`.
   - If `publicSeatId != 0`, checks `!isCohortSeatClaimed[coiFlag][publicSeatId]`. Stakeholders (`coiFlag == 1`) claim seats in cohort 1, preventing lockouts of independent scientists (`coiFlag == 0`).
4. **Nullifier Double-Claim Check (SV-03):** `!isNullifierSpent[publicInputs[9]]`.
5. **Key Limb Binding (SV-03):** `voterPubkey` must be 65 bytes (`0x04 || X || Y`) with $(X \gg 128) == \text{pk0}$, $(X \ \& \ 2^{128}-1) == \text{pk1}$, $(Y \gg 128) == \text{pk2}$, and $(Y \ \& \ 2^{128}-1) == \text{pk3}$.
6. **Strict ECDSA (r, s) Range Bounds & Low-$s$ (SV-10, SV-16):**
   - $r \in (0, P256\_N)$
   - $s \in (0, P256\_HALF\_N]$ (where $P256\_HALF\_N = \lfloor P256\_N / 2 \rfloor$).
7. **P-256 Ballot Signature Verification (SV-15, SV-16):**
   - Queries RIP-7212 precompile `0x0100` with `abi.encode(domainSeparatedHash, r, s, pubX, pubY)`.
   - On Ethereum L1 where `0x0100` is unavailable, delegates to `p256FallbackVerifier`:
     1. Tries canonical raw 160-byte staticcall (compatible with Daimo `P256Verifier` at `0xc2b7...4De4` and OpenZeppelin).
     2. Falls back to explicit 4-byte selector `IP256Verifier.verify(hash, r, s, pubX, pubY)`.
8. **Groth16 ZK-Email Proof Verification (SV-14, SV-18):**
   - Validates coordinates $< Q\_MOD$.
   - Rejects point-at-infinity $(0,0)$ on proof elements A, B, and C.
   - Computes linear combination $\text{vk\_x} = \text{IC}_0 + \sum_{i=0}^9 \text{input}[i] \cdot \text{IC}_{i+1}$ over 12 distinct, mathematically valid BN254 $\mathbb{G}_1$ points ($y^2 \equiv x^3 + 3 \pmod{Q\_MOD}$), skipping $i$ when $\text{input}[i] == 0$ to conserve gas.
   - Evaluates `0x08` (`ecPairing`) with toxic-waste-distinct quadratic twist point $\text{DELTA} = [-1]G_2 \neq \text{GAMMA}$.
