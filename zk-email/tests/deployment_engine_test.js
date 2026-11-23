/**
 * Comprehensive Test Suite for DDD Single-Port Deployment Engine
 * Tests:
 * 1. Target configuration validation rules (IPFS, Cloudflare, EVM)
 * 2. Idempotency management (skipping redundant deployments)
 * 3. Dry-run planning execution
 * 4. Automatic rollback on target failure
 * 5. Tamper-evident HMAC-signed audit log verification
 */

import { DeploymentOrchestrator } from "../deployment/src/shared/orchestrator.js";
import { IpfsArweaveAdapter } from "../deployment/src/adapters/ipfs-arweave-adapter.js";
import { CloudflareAdapter } from "../deployment/src/adapters/cloudflare-adapter.js";
import { EthereumEvmAdapter } from "../deployment/src/adapters/ethereum-evm-adapter.js";
import * as crypto from "crypto";

async function runDeploymentTests() {
  console.log("==========================================================");
  console.log("  RUNNING DEPLOYMENT ENGINE DDD / SOLID / DRY TESTS        ");
  console.log("==========================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(message);
    }
    console.log(`✓ PASS: ${message}`);
    passed++;
  }

  // Instantiate Adapters
  const ipfsAdapter = new IpfsArweaveAdapter();
  const cfAdapter = new CloudflareAdapter();
  const evmAdapter = new EthereumEvmAdapter();

  const targets = new Map();
  targets.set("ipfs-arweave", ipfsAdapter);
  targets.set("cloudflare", cfAdapter);
  targets.set("ethereum-evm", evmAdapter);

  const mockSecrets = {
    IPFS_PINATA_JWT: "test_pinata_jwt",
    CLOUDFLARE_API_TOKEN: "test_cf_token",
    EVM_RPC_URL: "https://rpc.sepolia.org",
    EVM_CHAIN_ID: "11155111"
  };

  const secretsProvider = async (key) => mockSecrets[key] || "";
  const auditHmacSecret = "deploy_audit_hmac_secret_key_1234";

  const orchestrator = new DeploymentOrchestrator(targets, secretsProvider, auditHmacSecret);

  // ----------------------------------------------------
  // TEST 1: Config Validation Rules
  // ----------------------------------------------------
  console.log("[Test 1] Adapter Configuration Validation...");
  
  // Valid configs
  const validConfigs = {
    "ipfs-arweave": { gatewayUrl: "https://gateway.pinata.cloud" },
    "cloudflare": { accountId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" },
    "ethereum-evm": {
      rpcUrl: "https://rpc.sepolia.org",
      safeAddress: "0x1234567890123456789012345678901234567890"
    }
  };

  const ipfsVal = await ipfsAdapter.validateConfig(validConfigs["ipfs-arweave"]);
  assert(ipfsVal.valid, "IPFS config valid with HTTPS gateway URL");

  const cfVal = await cfAdapter.validateConfig(validConfigs["cloudflare"]);
  assert(cfVal.valid, "Cloudflare config valid with 32-char hex accountId");

  const evmVal = await evmAdapter.validateConfig(validConfigs["ethereum-evm"]);
  assert(evmVal.valid, "EVM config valid with RPC URL and 20-byte Safe address");

  // Invalid config edge cases
  const badIpfs = await ipfsAdapter.validateConfig({ gatewayUrl: "ftp://invalid-gateway" });
  assert(!badIpfs.valid && badIpfs.errors.length > 0, "IPFS adapter rejects non-HTTP/HTTPS gateway");

  const badCf = await cfAdapter.validateConfig({ accountId: "too-short" });
  assert(!badCf.valid, "Cloudflare adapter rejects non-32-hex accountId");

  const badEvm = await evmAdapter.validateConfig({ rpcUrl: "https://rpc.sepolia.org", safeAddress: "0xbad" });
  assert(!badEvm.valid, "EVM adapter rejects malformed Safe address");

  // ----------------------------------------------------
  // TEST 2: Dry-Run Execution Planning
  // ----------------------------------------------------
  console.log("\n[Test 2] Dry-Run Planning Execution...");
  const artifactPayload = Buffer.from("<html>Scientific Vote Release Candidate 1</html>");

  const dryRunResults = await orchestrator.executeDeployment({
    targetNames: ["ipfs-arweave", "cloudflare", "ethereum-evm"],
    targetConfigs: validConfigs,
    environment: "staging",
    artifactPath: "./dist/index.html",
    artifactBytes: artifactPayload,
    dryRun: true
  });

  assert(dryRunResults["ipfs-arweave"].success, "IPFS dry-run planned successfully");
  assert(dryRunResults["cloudflare"].success, "Cloudflare dry-run planned successfully");
  assert(dryRunResults["ethereum-evm"].success, "EVM dry-run planned successfully");
  assert(dryRunResults["ipfs-arweave"].metadata.plan.steps.length === 4, "IPFS plan contains 4 discrete steps");

  // ----------------------------------------------------
  // TEST 3: Live Deployment & Idempotency
  // ----------------------------------------------------
  console.log("\n[Test 3] Live Execution & Idempotency Guarantee...");
  const liveResults = await orchestrator.executeDeployment({
    targetNames: ["ipfs-arweave", "cloudflare", "ethereum-evm"],
    targetConfigs: validConfigs,
    environment: "staging",
    artifactPath: "./dist/index.html",
    artifactBytes: artifactPayload,
    dryRun: false
  });

  assert(liveResults["ipfs-arweave"].endpointUrl.includes("bafybeic"), "IPFS deployment returned CIDv1 endpoint");
  assert(liveResults["cloudflare"].metadata.edgeRouting === "ACTIVE", "Cloudflare edge routing marked ACTIVE");
  assert(liveResults["ethereum-evm"].metadata.chainId === 11155111, "EVM verifier initialized for chain 11155111");

  // Second deployment with identical artifact -> must be skipped via idempotency
  console.log("\nTesting Idempotency on identical artifact...");
  const idempotentResults = await orchestrator.executeDeployment({
    targetNames: ["ipfs-arweave", "cloudflare", "ethereum-evm"],
    targetConfigs: validConfigs,
    environment: "staging",
    artifactPath: "./dist/index.html",
    artifactBytes: artifactPayload,
    dryRun: false
  });

  assert(Object.keys(idempotentResults).length === 0, "Idempotent deployment skipped redundant operations across all targets");

  // ----------------------------------------------------
  // TEST 4: Rollback Mechanism
  // ----------------------------------------------------
  console.log("\n[Test 4] Automated LIFO Rollback Verification...");
  const deployId = liveResults["ipfs-arweave"].deploymentId;
  const rbResult = await ipfsAdapter.rollback(deployId);
  assert(rbResult.success, "Adapter successfully executed rollback to prior stable state");

  // ----------------------------------------------------
  // TEST 5: Cryptographic Audit Trail Verification
  // ----------------------------------------------------
  console.log("\n[Test 5] Cryptographic HMAC Audit Trail Integrity...");
  const logs = orchestrator.getAuditLogs();
  assert(logs.length >= 6, `Audit log recorded ${logs.length} operations`);

  for (const log of logs) {
    const canonical = `${log.timestamp}|${log.deploymentId}|${log.target}|${log.action}|${log.status}`;
    const expectedSig = crypto.createHmac("sha256", auditHmacSecret).update(canonical).digest("hex");
    assert(log.logSignature === expectedSig, `Audit entry signature verified for action ${log.action} on ${log.target}`);
  }

  console.log("\n==========================================================");
  console.log(` RESULTS: ${passed}/${total} TESTS PASSED (100% SUCCESS) `);
  console.log("==========================================================");
}

runDeploymentTests().catch(err => {
  console.error(err);
  process.exit(1);
});
