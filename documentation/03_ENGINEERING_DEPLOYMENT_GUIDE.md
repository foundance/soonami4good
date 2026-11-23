# Engineering Deployment Guide: 2026 AI Scientific Vote
## End-to-End Deployment, Sovereign Orchestration & Multi-Route Pipeline

**Target Audience:** DevOps Engineers, Smart Contract Developers, System Architects  
**Classification:** Technical Deployment Runbook & Environment Setup  
**Repository Working Directory:** `d:/workspace/dapp/zk-circuit`  
**Prerequisites:** Docker, Foundry (`forge`), Node.js (v20+), Git  
**Related Documents:** [02_INFRASTRUCTURE_AND_BUDGET_BLUEPRINT.md](file:///d:/workspace/dapp/zk-circuit/documentation/02_INFRASTRUCTURE_AND_BUDGET_BLUEPRINT.md)

---

## 1. Technical Architecture & Component Topology

The system consists of four modular layers operating in lockstep:

```
+----------------------------------------------------------------------------------------------------+
|                                    END-TO-END DEPLOYMENT TOPOLOGY                                  |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [ LAYER 1: CLIENT FRONTEND ]                                                                      |
|  - Standalone Static WebApp: Scientific_Vote_App_v5.html (100% self-contained)                     |
|  - WebAssembly Prover: zk-prover.worker.js (Groth16 client prover in background RAM)               |
|  - WebCrypto & Passkey: Isolated ECDSA P-256 signing inside voter's Secure Enclave                 |
|                                |                                                                   |
|                                v (Swarm DHT / ENS Resolution)                                      |
|  [ LAYER 2: SOVEREIGN STORAGE & ROUTING ]                                                          |
|  - Self-Hosted Kubo IPFS Daemon: Announces CID to global libp2p DHT                                |
|  - Decentralized Gateway: rationalprocess.eth.limo (Zero-SaaS ENS resolution)                      |
|                                |                                                                   |
|                                v (Empty Verification Challenge Email via DKIM)                     |
|  [ LAYER 3: EDGE MAIL VERIFIER & RELAYER ]                                                         |
|  - Inbound Mail Router: Cloudflare Email Worker OR Local Postfix / Haraka Daemon                   |
|  - Cryptographic Verifier: Verifies RSA-2048 DKIM signature against institutional DNS TXT         |
|  - Gas Relayer: Submits claim transaction to smart contract on voter's behalf                      |
|                                |                                                                   |
|                                v (On-Chain Verification & State Transition)                        |
|  [ LAYER 4: SMART CONTRACTS (ETHEREUM / L2) ]                                                      |
|  - Groth16Verifier.sol: Zero-knowledge proof verifier with 10 public inputs & BN254 constraints    |
|  - PanelRegistry.sol: Merkle root gate, nullifier registry, and 213-byte ECDSA signature check   |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. The Three Deployment Routes

To maximize operational flexibility, the deployment pipeline supports three distinct routes, starting with **100% self-sufficiency**:

| Feature / Dimension | Route 1: Fully Sovereign (Recommended) | Route 2: Production Cloud Hybrid | Route 3: Local Isolated Sandbox |
|:---|:---|:---|:---|
| **Primary Goal** | **Zero third-party SaaS reliance; total cryptographic sovereignty.** | High-throughput enterprise production with global edge CDN. | Rapid local development, unit testing, and offline audits. |
| **IPFS Storage** | **Self-Hosted Kubo Node** (Docker container on Linux VPS). | Self-Hosted Kubo + Cloudflare IPFS edge caching. | Local in-memory HTTP server (`http://127.0.0.1:8085`). |
| **Email Ingestion** | Self-hosted Postfix/Haraka mail daemon on VPS. | Cloudflare Email Worker (Edge serverless routing). | Mock DKIM Relayer Script (`mock_dkim_relayer.js`). |
| **Blockchain RPC** | Local Geth / Nethermind full node or private RPC. | Alchemy / QuickNode Growth Tier RPC endpoint. | Local Foundry Anvil instance (`http://127.0.0.1:8545`). |
| **Domain Resolution** | Direct IPFS CID + ENS `.eth.limo` resolution. | `rationalprocess.eth.limo` + custom DNS domain. | Localhost browser URL. |
| **External Cost** | **$0 SaaS subscriptions** (~$15/mo VPS compute). | ~$20/mo (VPS + Cloudflare Workers Paid). | **$0.00 (100% Free).** |

---

## 3. Route 1: 100% Sovereign Deployment Pipeline (Step-by-Step)

### Step 3.1: Host Environment & VPS Provisioning
1. Launch an Ubuntu 24.04 LTS instance (Hetzner Cloud CPX21 or AWS Lightsail 4GB).
2. Configure non-root administrative user and SSH ed25519 authentication:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 4001/tcp  # IPFS Swarm libp2p
   sudo ufw allow 4001/udp  # IPFS Swarm QUIC
   sudo ufw allow 25/tcp    # SMTP Inbound DKIM verification
   sudo ufw enable
   ```

### Step 3.2: Launch Self-Hosted Kubo IPFS Daemon
Create `docker-compose.yml` on the server:
```yaml
version: '3.8'

services:
  ipfs-node:
    image: ipfs/kubo:v0.29.0
    container_name: zk-ipfs-node
    restart: unless-stopped
    environment:
      - IPFS_PATH=/data/ipfs
    ports:
      - "4001:4001"           # Global libp2p Swarm
      - "4001:4001/udp"       # Swarm QUIC
      - "127.0.0.1:5001:5001" # Admin RPC (Localhost only)
      - "127.0.0.1:8080:8080" # Gateway (Localhost only)
    volumes:
      - ipfs_data:/data/ipfs

volumes:
  ipfs_data:
```
Start the container and initialize swarm announcement:
```bash
docker compose up -d ipfs-node
docker exec -it zk-ipfs-node ipfs config Addresses.Gateway "/ip4/127.0.0.1/tcp/8080"
docker exec -it zk-ipfs-node ipfs id
```

### Step 3.3: Foundance DAO Governance Proposal (FGP) & Merkle Root Ratification
Before smart contracts are deployed to production, the participant manifest and election parameters must be ratified by the governance community:
1. Generate the OpenAlex top-300 panel dataset snapshot and compute the Poseidon Merkle root:
   ```bash
   node zk-email/scripts/generate_panel_manifest.js --source openalex --seats 300
   ```
2. Submit a formal **Foundance Governance Proposal (FGP)** on `foundance.org` specifying:
   - The SHA-256 hash of the complete OpenAlex participant manifest.
   - The Poseidon Merkle root (`0x9f3c4b8a2d10...e011`).
   - The election epoch (`20261103`) and voting deadline timestamp.
3. Once the FGP proposal reaches quorum and passes via `veSNI` voting, the ratified parameters are locked into the deployment configuration.

### Step 3.4: Deploy Smart Contracts via Foundry
From the repository root on your deployment machine:
1. Ensure Foundry is installed and up to date:
   ```bash
   forge --version
   ```
2. Configure `.env` with your deployment private key and RPC URL:
   ```bash
   cp .env.example .env
   # Set RPC_URL, DEPLOYER_PRIVATE_KEY, and ETHERSCAN_API_KEY
   ```
3. Compile all contracts:
   ```bash
   forge build --root zk-email
   ```
4. Deploy `Groth16Verifier.sol` and `PanelRegistry.sol`:
   ```bash
   forge script zk-email/script/DeployPanelRegistry.s.sol:DeployPanelRegistry \
     --rpc-url $RPC_URL \
     --broadcast \
     --verify \
     -vvvv
   ```
5. Note the deployed contract addresses:
   * `GROTH16_VERIFIER_ADDRESS=0x...`
   * `PANEL_REGISTRY_ADDRESS=0x...`

### Step 3.4: Deploy DKIM Verifier & Relayer Service
The relayer listens for empty `mailto:` verification challenges, validates the sending university's RSA-2048 DKIM header against public DNS, and submits the eligibility claim to `PanelRegistry.sol`:
```bash
cd zk-email/relayer
docker build -t zk-email-relayer .
docker run -d \
  --name zk-email-relayer \
  --restart unless-stopped \
  --network host \
  -e RPC_URL=$RPC_URL \
  -e REGISTRY_CONTRACT=$PANEL_REGISTRY_ADDRESS \
  -e RELAYER_PRIVATE_KEY=$RELAYER_PRIVATE_KEY \
  zk-email-relayer
```

### Step 3.5: Pin Frontend & Publish to IPFS Swarm
1. Pin the standalone HTML application to the sovereign Kubo node:
   ```bash
   ipfs add -r --cid-version 1 Scientific_Vote_App_v5.html zk-prover.worker.js
   ```
   *Output Example:*
   ```
   added bafybeigzkscientificvote2026appmanifestv5production0112 Scientific_Vote_App_v5.html
   ```
2. Verify the pin is announced globally:
   ```bash
   ipfs pin add bafybeigzkscientificvote2026appmanifestv5production0112
   ipfs dht provide bafybeigzkscientificvote2026appmanifestv5production0112
   ```
3. Update the ENS `contenthash` record for `rationalprocess.eth` using the Gnosis Safe multisig:
   ```
   contenthash: ipfs://bafybeigzkscientificvote2026appmanifestv5production0112
   ```
4. Access globally via any decentralized gateway:
   - `https://rationalprocess.eth.limo`
   - `https://ipfs.io/ipfs/bafybeigzkscientificvote2026appmanifestv5production0112`

---

## 4. Route 2: Production Cloud Hybrid Deployment

For enterprise high-availability during the 14-day global voting window, Route 2 offloads edge inbound email parsing to **Cloudflare Email Workers**:

### Step 4.1: Cloudflare Email Routing Configuration
1. In Cloudflare Dashboard, navigate to **Email Routing** for `rationalprocess.eth` (or your verified DNS zone).
2. Configure Catch-All or Dedicated Route:
   * **Custom Address:** `verify@rationalprocess.eth` (or `verify@scientificvote.org`).
   * **Action:** Send to Worker -> `zk-email-verify-worker`.

### Step 4.2: Deploy Email Worker
The email worker extracts the `DKIM-Signature` and subject headers and forwards them to the transaction relayer:
```javascript
export default {
  async email(message, env, ctx) {
    const rawEmail = await new Response(message.raw).text();
    const subject = message.headers.get("subject") || "";
    
    // Validate challenge format
    if (!subject.startsWith("SV-AI-2026-CLAIM:")) {
      message.setReject("Invalid challenge header format");
      return;
    }

    // Forward to secure relayer broker
    const response = await fetch(env.RELAYER_ENDPOINT + "/submit-dkim-proof", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-Worker-Secret": env.RELAYER_SHARED_SECRET
      },
      body: rawEmail
    });

    if (!response.ok) {
      message.setReject("Relayer submission failed");
    }
  }
};
```

---

## 5. Route 3: Isolated Sandbox & Local Offline Testing

Developers can test the entire deliberation lifecycle locally without spending gas or sending real emails:

### Step 5.1: Start Local Anvil Blockchain
```bash
anvil --chain-id 31337 --port 8545
```

### Step 5.2: Deploy Contracts to Anvil
```bash
forge script zk-email/script/DeployPanelRegistry.s.sol:DeployPanelRegistry \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Step 5.3: Start Local Web Server
Serve the frontend application locally:
```bash
python -m http.server 8085 --directory .
# Or using Node.js:
# npx serve . -p 8085
```

### Step 5.4: Test Voting in Browser
Open `http://127.0.0.1:8085/Scientific_Vote_App_v5.html`:
1. Use the pre-configured **Demo Simulator Bar** at the top of the page.
2. Select `?role=sci&seat=0 (Bengio · Mila)` to auto-fill the academic challenge parameters.
3. Advance through the 5 statement sliders.
4. Click **"Run Worker ZK Prover"** to observe client-side proof generation in background memory.
5. Download and verify the generated `.ebundle.json` ballot in the offline inspector.

---

## 6. Contract Initialization Parameters & Manifest Ingestion

When initializing `PanelRegistry.sol` in production, ensure the constructor arguments are strictly verified:

| Parameter | Type | Production Value | Purpose |
|:---|:---|:---|:---|
| `_verifier` | `address` | Deployed `Groth16Verifier` address | Enforces mathematical proof verification on curve BN254. |
| `_merkleRoot` | `bytes32` | `0x9f3c4b8a2d10...e011` | Poseidon Merkle root of the 300 OpenAlex scientist public identity commitments. |
| `_electionEpoch` | `uint256` | `20261103` (YYYYMMDD) | Domain-separates all nullifiers and prevents cross-epoch replays. |
| `_votingDeadline` | `uint256` | Timestamp (e.g. `1794355199`) | Hard closing timestamp after which ballots revert. |
| `_gasRelayer` | `address` | Authorized Relayer EOA | Subsidizes gas for academic claims without exposing relayer to arbitrary calls. |

---

## 7. Post-Deployment Verification Commands

Run these automated verification checks immediately after deployment:

```bash
# 1. Run all Foundry unit tests (9/9 must PASS)
forge test --root zk-email -vv

# 2. Run end-to-end cryptographic integration suite (50/50 must PASS)
node zk-email/tests/integration_test.js

# 3. Check deployed contract bytecode on RPC
cast code $PANEL_REGISTRY_ADDRESS --rpc-url $RPC_URL

# 4. Verify Groth16 Verifier linkage
cast call $PANEL_REGISTRY_ADDRESS "groth16Verifier()(address)" --rpc-url $RPC_URL
```
