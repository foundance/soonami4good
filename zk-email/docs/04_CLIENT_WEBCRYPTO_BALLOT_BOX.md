# 04. Client-Side WebCrypto, UI/UX & Ballot Box Architecture

## 1. Overview & Frontend Application Design

The primary client interface for the 2026 AI Scientific Vote is implemented as a self-contained, zero-backend, offline-capable Single-Page Application (SPA):
* **Production Application:** [Scientific_Vote_App_v5.html](file:///d:/workspace/dapp/zk-circuit/Scientific_Vote_App_v5.html)
* **Modular Client Package:** [webcrypto-key-manager.js](file:///d:/workspace/dapp/zk-circuit/zk-email/client/src/webcrypto-key-manager.js) and [ballot-box.js](file:///d:/workspace/dapp/zk-circuit/zk-email/client/src/ballot-box.js)

The application enforces strict **non-custodial key isolation** within the browser's cryptographic sandbox (`window.crypto.subtle`), while delivering a modern, accessible interface adhering to the institutional brand system (Source Serif 4, IBM Plex Sans, IBM Plex Mono).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Scientific_Vote_App_v5.html (Client SPA)                        │
├───────────────────┬──────────────────────┬──────────────────────┬──────────────────────┤
│      Step 1       │        Step 2        │        Step 3        │        Step 4        │
│   Briefing & Auth │    Cohort & Role     │   Ballot Deliberation│    Ballot Sealing    │
│  (DKIM / ORCID /  │   (Triage / COI /    │ (10 Pos × 5 Weights  │(213B WebCrypto Sign, │
│    Personhood)    │   Seat Selection)    │   + Rationale Note)  │ .ebundle, Inspector) │
└───────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

---

## 2. Interactive UI/UX Polish & Visual Contrast Engine

### 2.1 Statement Deliberation Grid (Dual Scales)
Each of the 5 frontier AI statements is evaluated on two distinct axes:
1. **Position Scale (1 to 10):** Measures the direction of scientific judgment (1 = strong rejection / skepticism, 10 = strong affirmation / urgency).
2. **Strength Weight Scale (0 to 4):** Measures epistemic confidence and evidentiary conviction:
   - `0`: **None** (Abstention / No opinion, multiplier = 0)
   - `1`: **Slight** (Low evidentiary weight, multiplier = 1)
   - `2`: **Moderate** (Standard evidentiary weight, multiplier = 2)
   - `3`: **Considerable** (Substantial empirical backing, multiplier = 3)
   - `4`: **Strong** (Maximum conviction / formal proof, multiplier = 4)

### 2.2 Reversed Strong Weight Indicator & Contrast Inversion Engine
In `Scientific_Vote_App_v5.html` (Lines 130–154 and 1246–1264), the position scale incorporates a dynamic, animated visual indicator showing the weight assigned to each position:

```css
/* Reversed Strong Weight Coloring on Position Scales */
.opt .pos-num {
  position: relative;
  z-index: 2;
  transition: color .12s;
}

.opt .weight-indicator {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(180deg, var(--accent-vibrant) 0%, var(--accent-rich) 100%);
  transition: height .22s cubic-bezier(.2, .8, .2, 1);
  z-index: 1;
}

.opt[aria-pressed="true"] {
  background: var(--accent-faint);
  border-color: var(--accent);
  color: var(--ink);
  transform: translateY(-1px);
}

/* Default selected state: high-contrast accent color on light accent-faint background */
.opt[aria-pressed="true"] .pos-num {
  color: var(--accent-rich);
  font-weight: 700;
}

/* Contrast Inversion: switch to white text when weight fill covers the number (>= 75%) */
.opt[aria-pressed="true"][data-wt-high="1"] .pos-num {
  color: var(--accent-ink);
  text-shadow: 0 1px 2px rgba(0, 0, 0, .25);
}
```

#### Why Contrast Inversion is Essential (The Readability Problem Solved)
* **The Failure Mode:** When a voter selects a position with **None (0)**, **Slight (1)**, or **Moderate (2)** weight, the `.weight-indicator` fill height is only 0%, 25%, or 50%. If the position text were set to white by default, the top half of the number would render as white against a light teal background (`--accent-faint` / `#E4EFED`), resulting in severe contrast loss and failing WCAG AA accessibility standards.
* **The Solution:**
  1. For multipliers `0`, `1`, and `2`, the text retains the deep institutional dark accent color (`--accent-rich` / `#073E3A`), guaranteeing a contrast ratio $> 7:1$ against the light card.
  2. In `updateBallotProgress()`: When `mult >= 3` (**Considerable** at 75% or **Strong** at 100%), JavaScript dynamically sets the attribute `data-wt-high="1"`.
  3. The CSS rule `.opt[aria-pressed="true"][data-wt-high="1"] .pos-num` flips the text color to crisp white (`--accent-ink` / `#FFFFFF`) with a subtle drop-shadow, ensuring readability on top of the dark teal gradient.

### 2.3 Scientific Rationale Accordion
To capture nuanced justifications without cluttering the voting grid:
* Each statement card includes an expandable **"Add a 1-sentence scientific rationale (optional)"** accordion.
* Clicking the accordion triggers a smooth CSS height transition (`.rationale-wrap.open`), revealing a monospace `<textarea>` with field-specific placeholder guidance.
* Rationales are canonicalized into the ballot payload under `statement_id.scientific_rationale` and committed to the cryptographic receipt.

### 2.4 Offline Scannable QR Code Canvas Engine
For voters wishing to send their zero-secret verification email from a mobile device or separate email client:
* [Scientific_Vote_App_v5.html](file:///d:/workspace/dapp/zk-circuit/Scientific_Vote_App_v5.html#L1037-L1070) embeds the real `qrcode-generator` engine (version 1.4.4).
* The `renderQRCodeToCanvas()` function renders the generated QR code directly to an HTML5 `<canvas id="qr-canvas">` with deep brand coloring (`#0D5C56` on `#FFFFFF`), integer cell rounding, and 3-cell quiet-zone margins.
* Scanning the QR code opens the default mobile mail client with the exact pre-filled `mailto:` address and challenge subject line.

### 2.5 Native Webmail Deep-Links (Gmail, Outlook 365, Apple Mail)
For institutional researchers using webmail without a local mail client installed:
* **Gmail Web:** `https://mail.google.com/mail/?view=cm&fs=1&to=<TO>&su=<SUBJ>&body=`
* **Microsoft Outlook 365 / Web:** `https://outlook.office.com/mail/deeplink/compose?to=<TO>&subject=<SUBJ>&body=`
* **Apple Mail / Native Client:** `mailto:<TO>?subject=<SUBJ>&body=`
Clicking any branded client launcher button opens the user's webmail or native client in a new tab with the exact zero-secret challenge recipient and cryptographically bound subject string pre-populated.

### 2.6 WebAssembly Groth16 Prover Worker with Liquid Progress Engine
To avoid main-thread UI freezing during multi-scalar multiplication (MSM) and witness generation:
* Proof synthesis is executed inside a dedicated Web Worker ([zk-prover.worker.js](file:///d:/workspace/dapp/zk-circuit/zk-prover.worker.js)) with an inline `Blob` worker fallback.
* A dynamic liquid progress meter (`.liquid-meter-track` / `.liquid-meter-fill`) animates from `0%` to `100%` across 4 granular cryptographic phases:
  1. `18%`: Initializing BN254 Curve Parameters & Wasm Memory
  2. `45%`: Synthesizing DKIM Header Constraints & Merkle Proof
  3. `74%`: Computing Multi-Scalar Multiplications (Groth16 A, B, C)
  4. `92%`: Synthesizing 213-byte Domain Nullifier Limbs (SV-15)
  5. `100%`: Verified in `< 3.2s` with 0ms main thread lockup.

---

## 3. WebCrypto Key Generation & Storage

### 3.1 Non-Exportable Private Keys (IndexedDB)
Keys are generated via `window.crypto.subtle.generateKey` on the NIST **P-256 (secp256r1)** curve:

```javascript
this.keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  false, // Non-extractable: private key bytes cannot be read by JS
  ["sign", "verify"]
);
```

Setting `extractable: false` guarantees that:
1. Raw private key material $sk$ cannot be exfiltrated by rogue scripts or extensions.
2. The key reference stored in `IndexedDB` remains confined to the device's secure enclave / browser cryptographic subsystem.

### 3.2 4-Limb Affine Decomposition (SV-03)
The 65-byte uncompressed public key `0x04 || X (32B) || Y (32B)` is exported and split into four 128-bit limbs for ZK circuit public inputs:

```javascript
function getPubkeyLimbs(rawPubHex) {
  const cleanHex = rawPubHex.replace(/^0x/, "");
  const xHex = cleanHex.slice(2, 66);
  const yHex = cleanHex.slice(66, 130);
  const pubX = BigInt("0x" + xHex);
  const pubY = BigInt("0x" + yHex);

  const pk0 = "0x" + (pubX >> 128n).toString(16).padStart(32, "0");
  const pk1 = "0x" + (pubX & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn).toString(16).padStart(32, "0");
  const pk2 = "0x" + (pubY >> 128n).toString(16).padStart(32, "0");
  const pk3 = "0x" + (pubY & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn).toString(16).padStart(32, "0");

  return { pubX, pubY, pk0, pk1, pk2, pk3, xHex, yHex };
}
```

These limbs populate `publicInputs[2..5]` of the Groth16 proof, cryptographically binding the voter's browser key to the institutional email verification.

### 3.3 Hardware Passkey & Secure Enclave Integration (WebAuthn / TouchID)
To eliminate vulnerability to browser cache clearing or accidental private browsing tab closes:
* The voter can bind their signing key directly to their device's hardware Secure Enclave / TPM via WebAuthn (`navigator.credentials.create` with `alg: -7` ES256).
* Compatible with Apple TouchID, FaceID, Windows Hello, and Android biometrics.
* When sealing the ballot, biometric user verification (`navigator.credentials.get`) is prompted to authorize the on-chain signature release.

---

## 4. Cryptographic Ballot Sealing & Alignment (SV-11, SV-15, SV-16)

### 4.1 The WebCrypto Internal Hashing Invariant (SV-15)
Per the W3C Web Cryptography API specification:
$$\text{crypto.subtle.sign}(\{\text{name: "ECDSA"}, \text{hash: "SHA-256"}\}, sk, M)$$
**always** executes $\text{SHA-256}(M)$ internally before computing the ECDSA $(r, s)$ signature over P-256. WebCrypto cannot sign a pre-computed 32-byte digest directly without hashing it a second time.

### 4.2 213-Byte Domain Separation Payload
To ensure that the signature produced by WebCrypto in the browser matches the signature verified on-chain by [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol) via the RIP-7212 precompile `0x0100`:
1. The client constructs the exact 213-byte packed byte buffer matching Solidity's `abi.encodePacked(...)`:
   $$\text{PackedData} = \text{BALLOT\_DOMAIN\_PREFIX}_{32\text{B}} \parallel \text{chainId}_{32\text{B}} \parallel \text{contract}_{20\text{B}} \parallel \text{epoch}_{32\text{B}} \parallel \text{nullifier}_{32\text{B}} \parallel \text{publicSeatId}_{32\text{B}} \parallel \text{coiFlag}_{1\text{B}} \parallel \text{ballotHash}_{32\text{B}}$$
2. The client passes `PackedData` into `crypto.subtle.sign`:

```javascript
// Exact 213-byte packed payload
const domainData = await computeDomainSeparatedData(
  chainId,
  registryAddress,
  electionEpoch,
  nullifierHex,
  publicSeatId,
  coiFlag,
  ballotHashHex
);

// WebCrypto computes SHA-256(domainData.packedBytes) and signs it over P-256
const sigBuf = await crypto.subtle.sign(
  { name: "ECDSA", hash: { name: "SHA-256" } },
  keyPair.privateKey,
  domainData.packedBytes
);
```

3. In Solidity, [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol#L210-L225) computes:
```solidity
bytes32 domainSeparatedHash = sha256(
    abi.encodePacked(
        BALLOT_DOMAIN_PREFIX,
        block.chainid,
        address(this),
        electionEpoch,
        nullifier,
        publicSeatId,
        coiFlag,
        ballotHash
    )
);
```
Because $\text{SHA-256}(\text{packedBytes}) \equiv \text{domainSeparatedHash}$, the on-chain precompile `0x0100` verifies the signature with 100% mathematical fidelity.

### 4.3 Low-$s$ Normalization & Range Bounds (SV-10, SV-16)
To eliminate ECDSA signature malleability (where $(r, s)$ and $(r, n - s)$ are both algebraically valid):
```javascript
const rBytes = rawSig.slice(0, 32);
const sBytes = rawSig.slice(32, 64);
let rBig = BigInt("0x" + bytesToHex(rBytes));
let sBig = BigInt("0x" + bytesToHex(sBytes));

// SV-10 & SV-16: Normalize to low-s if s > n / 2
if (sBig > HALF_P256_N) {
  sBig = P256_N - sBig;
}
```
The resulting signature is formatted as 64 hex bytes `0x || r (32B) || s (32B)` and verified on-chain against `rVal > 0 && rVal < P256_N && sVal > 0 && sVal <= P256_HALF_N`.

---

## 5. Offline Drag-and-Drop Bundle Inspector

Step 4 of `Scientific_Vote_App_v5.html` includes an embedded client-side cryptographic audit engine:
* **Dropzone:** Accepts any exported `.ebundle.json` file via drag-and-drop or file upload.
* **100% Offline Execution:** Runs entirely inside the browser using `window.crypto.subtle` with zero network requests.
* **Verification Pipeline:**
  1. Validates bundle JSON schema and required fields (`ballot_payload`, `zk_proof`, `webcrypto_ecdsa_p256_signature`).
  2. Extracts and verifies public key limb decomposition against `zk_proof.public_inputs[2..5]`.
  3. Validates low-$s$ compliance ($s \le \frac{n}{2}$).
  4. Reconstructs the 213-byte packed domain-separated payload from bundle parameters.
  5. Executes `crypto.subtle.verify` over the packed payload using the recovered voter public key.
* **Audit Dashboard:** Displays status badge, verified parameters, nullifier commitment, cohort classification, and security check badges (SV-10/16 Low-s, SV-11/15 SHA-256 Aligned, SV-03/09 4-Limbs Bound).

---

## 6. Election Bundle Format (`.ebundle.json`)

The final export artifact generated upon ballot casting is structured as:

```json
{
  "schema": "soonami4good.rationalprocess.ebundle.v1",
  "treasury_vault": "soonami4good.rethink.finance",
  "panel_merkle_root": "0x1d8f4a92c3e084b17f99102a45b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e",
  "ballot_hash": "0xaabbcc...",
  "domain_separated_hash": "0xdc5211...",
  "domain_separated_bytes": "0xd4c7c32f... (213 bytes / 426 hex chars)",
  "ballot_payload": {
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
    "votes": [ ... ],
    "sealed_at_utc": "2026-10-30T10:00:00.000Z"
  },
  "webcrypto_ecdsa_p256_signature": "0x...",
  "signature_compliance": {
    "curve": "secp256r1 (NIST P-256)",
    "low_s_normalized": true,
    "domain_separated": true,
    "sha256_webcrypto_aligned": true
  },
  "zk_proof": { ... },
  "onchain_relayer_calldata": {
    "contract_target": "PanelRegistry.claimAndCastBallot",
    "registry_address": "0x4b7ec3b48f95c527e59b9643d9cc2cbe74f4c9c1",
    "public_inputs_10": [ ... ],
    "proof_a": [ ... ],
    "proof_b": [ ... ],
    "proof_c": [ ... ]
  }
}
```
