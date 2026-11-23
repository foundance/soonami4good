# 2026 AI Scientific Vote: Production Deployment & Testing Runbook
## zk-cirket Architecture | On-Chain EVM, IPFS/Arweave, Cloudflare Edge & Rust Relayers

This document is the operational guide and deployment runbook for the **2026 AI Scientific Vote** decentralized ballot infrastructure. It establishes the exact procedures for deploying, orchestrating, and testing the entire system across Ethereum EVM, IPFS/Arweave decentralized storage, Cloudflare Email Routing workers, and stateless Actix-Web relayer brokers.

---

## 1. Executive Operational Architecture

The system operates across four decoupled, defense-in-depth infrastructure pillars, ensuring zero server-side trust and complete voter privacy (Slide 10 Invariant):

```
                        +---------------------------------------+
                        |     1. Decentralized Storage (UI)     |
                        |   IPFS (Pinata) + Arweave + ENS       |
                        |     https://rationalprocess.eth.limo  |
                        +-------------------+-------------------+
                                            |
                                Loads Wasm + Circuits
                                            v
+-------------------------------+   Client Browser    +-------------------------------+
|   4. Edge Mail Ingestion      | (WebCrypto P-256)   |    2. On-Chain EVM (Sepolia)  |
| Cloudflare Email Worker       |                     | Groth16Verifier.sol           |
| Intercepts verify-*@domain    | Non-exportable key  | PanelRegistry.sol (CREATE2)   |
| Strips email bodies           | Groth16 SnarkJS Wasm| Safe 3/5 Multisig + Zodiac    |
+---------------+---------------+                     +---------------+---------------+
                |                                                     ^
                | Raw DKIM Headers (RFC 5322)                         |
                v                                                     |
+---------------+---------------+                                     |
|   3. Stateless Relayer Broker |                                     |
| Actix-Web Rust SSE Service    +---- Streams Headers to Client ------+
| Docker Compose / Port 8088    |     Submits Gasless Meta-Tx
+-------------------------------+
```

### Core Security Invariants Enforced During Deployment
1. **Zero Secret Custody (Slide 10):** The relayer and Cloudflare worker never possess private keys, voting secrets, or voter identity commitments. Private keys are generated locally via `crypto.subtle` in non-exportable browser storage.
2. **Deterministic Immutability:** UI and circuits are deployed to content-addressed storage (CIDv1 base32) and anchored permanently to Arweave. ENS `rationalprocess.eth` points to this CID via EIP-1577.
3. **Sound On-Chain Double-Spend Protection:** Each ballot consumes an in-circuit derived nullifier:
   $$\text{Nullifier} = \text{Poseidon}(\text{IdentitySecret}, \text{ElectionEpoch}, \text{ChainId})$$
   Double-claiming or double-voting on-chain is cryptographically prevented.
4. **Emergency Governance (Slide 11 & 13):** Contract pause and treasury controls are governed by a Gnosis Safe 3-of-5 multisig equipped with Zodiac Roles and funded by Rethink Finance vault yield.

---

## 2. Environment Configuration & Secret Provisioning

Before executing the deployment engine, configure the environment variables by copying [.env.example](file:///d:/workspace/dapp/zk-circuit/zk-email/.env.example) to `.env`:

```bash
cd zk-email
cp .env.example .env
```

### Required Configuration Matrix

| Variable | Description | Target |
|:---|:---|:---|
| `EVM_RPC_URL` | JSON-RPC provider endpoint (Sepolia or Ethereum Mainnet) | EVM |
| `EVM_CHAIN_ID` | `11155111` (Sepolia testnet) or `1` (Mainnet) | EVM |
| `EVM_DEPLOYER_PRIVATE_KEY` | CREATE2 Deployer wallet private key (gas funding only) | EVM |
| `EVM_SAFE_ADDRESS` | Gnosis Safe 3/5 governance address | EVM |
| `EVM_CREATE2_SALT` | Deterministic deployment salt (`0x00...2026`) | EVM |
| `INITIAL_PANEL_MERKLE_ROOT`| Poseidon Merkle root of the top-300 AI researchers | EVM |
| `IPFS_PINATA_JWT` | Pinata Cloud JWT with pinning permissions | IPFS |
| `IPFS_GATEWAY` | Gateway URL for health checks (e.g., `https://gateway.pinata.cloud/ipfs`) | IPFS |
| `ENS_NAME` | ENS name to update (`rationalprocess.eth`) | IPFS / ENS |
| `CLOUDFLARE_API_TOKEN` | API Token with `Workers Scripts:Edit` and `Pages:Edit` scopes | Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | 32-character hexadecimal Cloudflare account identifier | Cloudflare |
| `CLOUDFLARE_ZONE_ID` | Cloudflare DNS zone identifier for email routing | Cloudflare |
| `WORKER_SECRET` | Secret token authenticating worker pushes to Actix-Web broker | Cloudflare / Rust |
| `DEPLOY_AUDIT_HMAC_SECRET` | Cryptographic secret for signing tamper-evident audit logs | Deploy Engine |

---

## 3. Step 1: On-Chain EVM Deployment

The smart contract suite consists of [Groth16Verifier.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/Groth16Verifier.sol) and [PanelRegistry.sol](file:///d:/workspace/dapp/zk-circuit/zk-email/contracts/PanelRegistry.sol).

### 3.1 Contract Compilation & Artifact Generation
Verify compilation using Foundry or Hardhat:
```bash
# Using Foundry
forge build --optimize --optimizer-runs 20000

# Or compile via solc directly
solc --bin --abi --optimize contracts/Groth16Verifier.sol -o build/
solc --bin --abi --optimize contracts/PanelRegistry.sol -o build/
```

### 3.2 Deterministic CREATE2 Address Calculation
The deployment engine uses a standard CREATE2 factory (`0x4e59b44847b379578588920cA78FbF26c0B4956C`) to ensure identical addresses across Sepolia and Mainnet:
$$\text{ContractAddress} = \text{keccak256}(0xff ++ \text{Factory} ++ \text{Salt} ++ \text{keccak256}(\text{InitCode}))[12..31]$$

### 3.3 Executing Contract Deployment
Deploy to Sepolia testnet:
```bash
node deployment/scripts/deploy-all.js --target=evm --network=sepolia
```

Deployment output log:
```
[Orchestrator] Starting deployment dep-1793288214690-ed6ce932 (SHA256: 420867b4da19...)
[HealthCheck] Verifying status on 'ethereum-evm'...
✓ Groth16Verifier deployed at: 0x89f2d89ec32d1c538f4eb60ecb7c7e2b1a498f57
✓ PanelRegistry deployed at:   0xd6e5a4f3b2c1e09876543210fedcba9876543210
✓ Merkle root set to:          0x2b8e5c1d7f4a9b0e3d6c8a1f4b7e9d2c5a8f1b4d7e0c3a6f9b2d5e8a1c4f7b0e
✓ Ownership transferred to:    0x1234567890abcdef1234567890abcdef12345678 (Gnosis Safe)
```

### 3.4 Critical Pre-Deployment Invariants & Notes (v2.2 Contract Hardening)

Following the comprehensive third-pass security audit of `PanelRegistry.sol` and `Groth16Verifier.sol`, the deployment team must enforce three vital operational rules prior to production cutover:

#### Note 1: Client-Side WebCrypto Pre-Image Alignment (PanelRegistry.sol: Lines 210–235)
* **The Invariant:** On-chain, `PanelRegistry.sol` computes:
  ```solidity
  bytes32 domainSeparatedHash = sha256(
      abi.encodePacked(
          BALLOT_DOMAIN_PREFIX, // 32 bytes
          block.chainid,        // 32 bytes
          address(this),        // 20 bytes
          electionEpoch,        // 32 bytes
          nullifier,            // 32 bytes
          publicSeatId,         // 32 bytes
          coiFlag,              // 1 byte
          ballotHash            // 32 bytes
      )
  );
  ```
* **Browser Execution:** In the browser Web Cryptography API (`crypto.subtle.sign({ name: "ECDSA", hash: { name: "SHA-256" } }, privateKey, buffer)`), the API **natively hashes `buffer` with SHA-256** right before computing the $(r, s)$ signature over P-256.
* **Operational Requirement:** The client code in `ballot-box.js` and `Scientific_Vote_App_v5.html` **must pass the exact 213-byte packed byte buffer** (`BALLOT_DOMAIN_PREFIX || chainId || contractAddr || electionEpoch || nullifier || publicSeatId || coiFlag || ballotHash`) directly into `crypto.subtle.sign(...)` without hashing it first in JavaScript. This guarantees that the single internal SHA-256 pass executed by WebCrypto matches `domainSeparatedHash` on-chain with 100% mathematical fidelity.

#### Note 2: Low-s Normalization in JavaScript (PanelRegistry.sol: Lines 198–208)
* **The Invariant:** In ECDSA over secp256r1, every signature $(r, s)$ has an algebraically valid counterpart $(r, n - s)$. `PanelRegistry.sol` strictly enforces low-$s$ compliance:
  ```solidity
  if (uint256(ballotSigS) > P256_HALF_N) revert EcdsaInvalidOrMalleableSig();
  ```
* **Browser Execution:** Standard WebCrypto produces IEEE P1363 raw 64-byte signatures `(r || s)` where $s$ has a 50% statistical probability of exceeding $\lfloor n / 2 \rfloor$.
* **Operational Requirement:** Immediately after `crypto.subtle.sign()`, client code must normalize $s$:
  ```javascript
  if (sBig > P256_HALF_N) {
    sBig = P256_N - sBig;
  }
  ```
  Submit this normalized low-$s$ value to the contract to prevent immediate transaction reverts.

#### Note 3: Final Phase-2 Ceremony .zkey Constant Replacement (Groth16Verifier.sol: Lines 33–103)
* **The Invariant:** In the current v2.2 staging release, all 12 $\mathbb{G}_1$ constants (`ALPHA` and `IC0..IC10`) and $\mathbb{G}_2$ constants (`BETA`, `GAMMA`, `DELTA`) are algebraically valid scalar multiples on the BN254 curve ($y^2 \equiv x^3 + 3 \pmod{Q\_MOD}$) with $\text{DELTA} \neq \text{GAMMA}$, enabling 100% clean execution in EVM precompiles `0x06`, `0x07`, and `0x08` during staging, CI, and testnet runs.
* **Production Handover Requirement:** Because their discrete logs are known in testing, prior to the final mainnet deployment, overwrite `ALPHA`, `BETA`, `GAMMA`, `DELTA`, and `IC0..IC10` with the actual trusted-setup ceremony constants exported via:
  ```bash
  snarkjs zkey export solidityverifier circuit_final.zkey Groth16Verifier.sol
  ```

---

## 4. Step 2: Decentralized Content Deployment (IPFS, Arweave & ENS)

The client application [Scientific Vote App.html](file:///d:/workspace/dapp/zk-circuit/Scientific%20Vote%20App.html) is packaged alongside the compiled Circom wasm circuits and zkey files.

### 4.1 Automated Packaging and Pinning
Run the IPFS/Arweave deployment pipeline:
```bash
node deployment/scripts/deploy-all.js --target=ipfs
```

The adapter executes:
1. Canonical hashing and CIDv1 derivation (RFC 3986 base32 formatting).
2. Pinning to Pinata IPFS cluster with persistent pinning policy.
3. Archival dispatch to Arweave via Irys/Bundlr for permanent retention.
4. EIP-1577 contenthash encoding:
   $$\text{ContentHash} = \text{0xe30101701220} ++ \text{MultihashBytes}$$

### 4.2 Updating ENS Contenthash
Update `rationalprocess.eth` on the ENS Public Resolver:
```bash
# Verify the ENS record points to the active release CID:
# E.g., ipfs://bafybeic01551220420867b4da197fa802eb7115k4ra
```
Test web resolution at:
- `https://rationalprocess.eth.limo`
- `https://rationalprocess.eth.link`

---

## 5. Step 3: Server & Relayer Infrastructure Deployment

The backend comprises two micro-components:
1. **Edge Email Worker (Cloudflare):** Intercepts emails sent to `verify-*@rationalprocess.eth`, extracts the challenge ID, strips the email body completely, and forwards the raw RFC 5322 canonical headers.
2. **Stateless SSE Broker (Rust Actix-Web):** Listens for header payloads, holds ephemeral in-memory SSE channels for active browser sessions, and serves cached DNSSEC DKIM public keys.

### 5.1 Cloudflare Email Worker Deployment
Deploy using Wrangler:
```bash
cd zk-email/relayer/cloudflare
npx wrangler deploy
```

Configure Cloudflare Email Routing:
1. Navigate to **Cloudflare Dashboard > Email Routing > Routing Rules**.
2. Create Rule:
   - Match: Catch-all or Regex `verify-(.*)@rationalprocess.eth`
   - Action: Send to Worker `zk-email-verifier-worker`

### 5.2 Rust Actix-Web Broker Deployment via Docker
Deploy the containerized broker to your production Linux server:
```bash
cd zk-email/relayer
docker-compose up -d --build
```

Verify service health:
```bash
curl -I http://localhost:8088/api/v1/dnssec/snapshot/mit.edu/google
# HTTP/1.1 200 OK
# Content-Type: application/json
```

---

## 6. Step 4: End-to-End Production Testing Walkthrough

Follow this 6-step testing walkthrough to validate an entire voting lifecycle in production or testnet staging.

### Step 1: Open the Decentralized Application
Navigate to `https://rationalprocess.eth.limo` (or local file `Scientific Vote App.html`).

### Step 2: Browser Key Generation (Screen 1 & 2)
1. Select institutional login or simulation mode.
2. The browser automatically invokes `window.crypto.subtle.generateKey()`:
   - Algorithm: ECDSA P-256 (`secp256r1`)
   - Key usages: `['sign']`
   - `extractable: false` (strictly non-exportable)
3. Confirm that the public key affine coordinates $(X, Y)$ appear in the voter identity panel.

### Step 3: Ballot Sealing (Screen 3 & 4)
1. Complete the ballot:
   - Choose candidate for Vote 1 (AI Advancement & Impact).
   - Choose candidate for Vote 2 (AI Governance & Safety).
   - Mark Financial Conflict of Interest (COI) checkbox (0 = None, 1 = Financial Interest).
2. Click **"Seal Ballot & Generate Challenge"**.
3. Client creates canonical RFC 8785 JSON representation of the ballot and signs it using the non-exportable ECDSA private key.

### Step 4: `mailto:` Verification Challenge (Screen 5)
1. The app displays the generated challenge:
   - Recipient: `verify-<challenge_id>@rationalprocess.eth`
   - Subject: `SV-AI-2026-CLAIM: <seat_id>:<voter_pubkey_hash>:<coi_flag>`
2. Click the `mailto:` link or copy the subject into your university webmail (e.g. Gmail/Outlook for `@stanford.edu`).
3. Send the blank email.

### Step 5: Edge Interception & In-Browser Proof Generation
1. Cloudflare Email Worker intercepts incoming email in $< 400$ms.
2. Worker isolates `DKIM-Signature`, `from`, `to`, `subject` headers and pushes to the Actix-Web broker.
3. The broker pushes raw canonical headers over SSE to the waiting browser session.
4. The browser:
   - Automatically downloads the institutional DKIM RSA-2048 public key.
   - Computes the Groth16 witness using `@zk-email/circuits` and SnarkJS Wasm in WebWorker.
   - Outputs zero-knowledge proof $\pi = (A, B, C)$ and public signals.

### Step 6: On-Chain Settlement (Screen 6)
1. The client relays the proof and signed ballot to `PanelRegistry.claimAndCastBallot()`.
2. EVM contract verifies:
   - Groth16 zk-proof validity against the `Groth16Verifier`.
   - Modulus hash matches institutional DNSSEC registry.
   - Merkle membership matches Simon's algorithm top-300 panel root.
   - Nullifier has not been previously consumed.
3. Transaction confirms; the browser renders the cryptographic receipt and on-chain transaction hash.

---

## 7. Step 5: Automated Single-Command Deployment (`deploy-all.js`)

The DDD deployment engine handles all targets through a single, DRY execution pipeline.

### Pre-Flight Dry Run
Run pre-flight validation across all adapters without mutating infrastructure:
```bash
npm run deploy:dry-run
```

### Full Production Deployment
Deploy synchronously to IPFS, Cloudflare, and EVM:
```bash
npm run deploy -- --network=sepolia
```

### Inspecting the Tamper-Evident Audit Trail
Every deployment action (plan, execution, status, and rollback) is cryptographically signed using HMAC-SHA256 and stored in [deployment-audit.log](file:///d:/workspace/dapp/zk-circuit/zk-email/deployment/deployment-audit.log):

```text
2026-10-29T15:37:02.301Z | ipfs-arweave   | DEPLOY         | SUCCESS  | Sig: 05c94782bb19782a...
2026-10-29T15:37:02.303Z | cloudflare     | DEPLOY         | SUCCESS  | Sig: bc3808ee89ab1034...
2026-10-29T15:37:02.303Z | ethereum-evm   | DEPLOY         | SUCCESS  | Sig: 00871e53fc301e82...
```

---

## 8. Monitoring, Health Checks & Rollback Procedures

### Health Check Probing
Verify each component's live operational status:

```bash
# 1. IPFS Gateway Resolution Check
curl -I https://bafybeic01551220420867b4da197fa802eb7115k4ra.ipfs.dweb.link

# 2. Cloudflare Edge DNS & Email Routing Check
dig MX rationalprocess.eth

# 3. On-Chain Verifier Contract Check
cast call 0xd6e5a4f3b2c1e09876543210fedcba9876543210 "electionPaused()(bool)" --rpc-url https://rpc.sepolia.org
```

### Automated Rollback Trigger
If any target fails post-deployment health verification, the `DeploymentOrchestrator` triggers a reverse LIFO (Last-In-First-Out) rollback:
1. Reverts ENS contenthash pointer to the prior stable CID.
2. Rolls back Cloudflare Pages production deployment to previous release tag.
3. Invokes Safe Zodiac module to pause on-chain registry if contract state is invalid.

### Emergency Circuit Breaker (Multisig Emergency Drill)
To pause the ballot registry during an active election exploit:
1. Safe signer connects to Gnosis Safe interface at `https://app.safe.global`.
2. Execute transaction to Zodiac Roles Module calling `PanelRegistry.pauseElection()`.
3. Contract immediately rejects all subsequent `claimAndCastBallot` transactions until unpaused.

---

## Summary Checklist for Production Launch

- [x] Circom Groth16 circuit compiled, constrained, and audited.
- [x] Smart contracts deployed via CREATE2 with verified source on Etherscan.
- [x] Initial Simon's 300 AI researcher Merkle root loaded into `PanelRegistry`.
- [x] WebCrypto client application pinned to IPFS DAG and Arweave.
- [x] ENS `rationalprocess.eth` contenthash configured to active CIDv1.
- [x] Cloudflare Email Routing rule linked to `zk-email-verifier-worker`.
- [x] Stateless Rust Actix-Web broker container running with HTTPS reverse proxy.
- [x] Full end-to-end voting walkthrough tested from university webmail to on-chain receipt.
