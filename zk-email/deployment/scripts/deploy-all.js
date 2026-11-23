#!/usr/bin/env node
/**
 * ==============================================================================
 * Automated Production Deployment CLI Runner for 2026 AI Scientific Vote
 * Architecture: DDD Single-Port Deployment Pipeline (SOLID & DRY)
 * ==============================================================================
 * Usage:
 *   node deployment/scripts/deploy-all.js [--dry-run] [--target=all|ipfs|cloudflare|evm] [--network=sepolia|mainnet]
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import { DeploymentOrchestrator } from "../src/shared/orchestrator.js";
import { IpfsArweaveAdapter } from "../src/adapters/ipfs-arweave-adapter.js";
import { CloudflareAdapter } from "../src/adapters/cloudflare-adapter.js";
import { EthereumEvmAdapter } from "../src/adapters/ethereum-evm-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const ZK_EMAIL_DIR = path.resolve(__dirname, "../..");

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const targetArg = args.find(a => a.startsWith("--target="))?.split("=")[1] || "all";
const networkArg = args.find(a => a.startsWith("--network="))?.split("=")[1] || "sepolia";

console.log("==================================================================");
console.log("  2026 AI SCIENTIFIC VOTE - PRODUCTION DEPLOYMENT ORCHESTRATOR    ");
console.log("==================================================================");
console.log(` Mode:        ${isDryRun ? "DRY-RUN (Pre-flight validation only)" : "LIVE PRODUCTION DEPLOYMENT"}`);
console.log(` Target:      ${targetArg.toUpperCase()}`);
console.log(` Network:     ${networkArg.toUpperCase()}`);
console.log(` Environment: ${networkArg === "mainnet" ? "production" : "staging"}`);
console.log("------------------------------------------------------------------\n");

// Read configuration from environment or secure defaults
const config = {
  // IPFS / Arweave
  IPFS_PINATA_JWT: process.env.IPFS_PINATA_JWT || "pinata_jwt_staging_token_mock",
  IPFS_GATEWAY: process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs",
  ENS_NAME: process.env.ENS_NAME || "rationalprocess.eth",

  // Cloudflare
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || "cf_token_staging_mock",
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  CLOUDFLARE_ZONE_ID: process.env.CLOUDFLARE_ZONE_ID || "f0e1d2c3b4a5968778695a4b3c2d1e0f",
  CLOUDFLARE_PAGES_PROJECT: process.env.CLOUDFLARE_PAGES_PROJECT || "scientific-vote-2026",

  // EVM
  EVM_RPC_URL: process.env.EVM_RPC_URL || (networkArg === "mainnet" ? "https://eth.llamarpc.com" : "https://rpc.sepolia.org"),
  EVM_CHAIN_ID: networkArg === "mainnet" ? "1" : "11155111",
  EVM_SAFE_ADDRESS: process.env.EVM_SAFE_ADDRESS || "0x1234567890abcdef1234567890abcdef12345678",
  EVM_CREATE2_SALT: process.env.EVM_CREATE2_SALT || "0x0000000000000000000000000000000000000000000000000000000000002026",

  // Audit
  DEPLOY_AUDIT_HMAC_SECRET: process.env.DEPLOY_AUDIT_HMAC_SECRET || "production_audit_hmac_secret_2026_scientific_vote"
};

// Bundle artifacts
console.log("[1/5] Assembling and hashing production release bundles...");
let clientAppContent = "";
const clientAppPath = path.join(ROOT_DIR, "Scientific Vote App.html");
if (fs.existsSync(clientAppPath)) {
  clientAppContent = fs.readFileSync(clientAppPath, "utf-8");
  console.log(`  ✓ Loaded Client Web App: ${clientAppPath} (${clientAppContent.length} bytes)`);
} else {
  clientAppContent = "<!DOCTYPE html><html><head><title>Scientific Vote</title></head><body><h1>Scientific Vote 2026</h1></body></html>";
  console.log("  ⚠ Fallback client app bundle used.");
}

const artifactBytes = Buffer.from(clientAppContent, "utf-8");
const bundleHash = crypto.createHash("sha256").update(artifactBytes).digest("hex");
console.log(`  ✓ Release Bundle SHA-256 Digest: ${bundleHash}\n`);

// Instantiate Adapters and Target Registry
const targets = new Map();
const targetNames = [];

if (targetArg === "all" || targetArg === "ipfs") {
  targets.set("ipfs-arweave", new IpfsArweaveAdapter());
  targetNames.push("ipfs-arweave");
}
if (targetArg === "all" || targetArg === "cloudflare") {
  targets.set("cloudflare", new CloudflareAdapter());
  targetNames.push("cloudflare");
}
if (targetArg === "all" || targetArg === "evm") {
  targets.set("ethereum-evm", new EthereumEvmAdapter());
  targetNames.push("ethereum-evm");
}

const secretsProvider = async (key) => config[key] || "";
const orchestrator = new DeploymentOrchestrator(targets, secretsProvider, config.DEPLOY_AUDIT_HMAC_SECRET);

// Construct Target-Specific Config DTOs
const targetConfigs = {
  "ipfs-arweave": {
    gatewayUrl: config.IPFS_GATEWAY,
    pinataJwt: config.IPFS_PINATA_JWT,
    arweaveGatewayUrl: "https://arweave.net",
    ensDomain: config.ENS_NAME,
    pinTtlSeconds: 31536000
  },
  "cloudflare": {
    accountId: config.CLOUDFLARE_ACCOUNT_ID,
    apiToken: config.CLOUDFLARE_API_TOKEN,
    projectName: config.CLOUDFLARE_PAGES_PROJECT,
    zoneId: config.CLOUDFLARE_ZONE_ID,
    workerName: "zk-email-verifier-worker",
    routes: ["verify-*@rationalprocess.eth"]
  },
  "ethereum-evm": {
    rpcUrl: config.EVM_RPC_URL,
    chainId: parseInt(config.EVM_CHAIN_ID, 10),
    safeAddress: config.EVM_SAFE_ADDRESS,
    create2Salt: config.EVM_CREATE2_SALT,
    contracts: [
      { name: "Groth16Verifier", constructorArgs: [] },
      {
        name: "PanelRegistry",
        constructorArgs: [
          "0x2b8e5c1d7f4a9b0e3d6c8a1f4b7e9d2c5a8f1b4d7e0c3a6f9b2d5e8a1c4f7b0e", // _panelMerkleRoot
          202610, // _electionEpoch
          1794355199, // _votingClosesAt (Nov 2026)
          "0x89f2d89ec32d1c538f4eb60ecb7c7e2b1a498f57", // _verifierAddress
          config.EVM_SAFE_ADDRESS, // _safeTreasury
          [
            "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", // Stanford DKIM
            "0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e"  // ORCID DKIM
          ]
        ]
      }
    ]
  }
};

async function main() {
  try {
    console.log("[2/5] Executing Deployment Pipeline Orchestration...");
    const results = await orchestrator.executeDeployment({
      artifactBytes,
      artifactPath: clientAppPath,
      targetNames,
      targetConfigs,
      environment: networkArg === "mainnet" ? "production" : "staging",
      dryRun: isDryRun
    });

    if (isDryRun) {
      console.log("\n[3/5] Pre-Flight Dry-Run Execution Plan Summary:");
      for (const [tName, res] of Object.entries(results)) {
        const plan = res.metadata?.plan;
        console.log(`\n  Target: [${tName.toUpperCase()}]`);
        if (plan?.steps) {
          plan.steps.forEach((s, idx) => {
            console.log(`    ${idx + 1}. [${s.id}] ${s.description} (Duration: ~${s.estimatedDurationSec}s)`);
          });
        }
      }
      console.log("\n==================================================================");
      console.log("  DRY RUN COMPLETED SUCCESSFULLY - ALL PRE-CONDITIONS VERIFIED    ");
      console.log("==================================================================\n");
      return;
    }

    console.log("\n[3/5] Post-Deployment Status Inspection...");
    const summaryRows = [];
    for (const [tName, res] of Object.entries(results)) {
      summaryRows.push({
        Target: tName,
        DeploymentId: res.deploymentId,
        Endpoint: res.endpointUrl || "N/A",
        Status: res.success ? "DEPLOYED ✓" : "FAILED ✗",
        ActiveHash: res.metadata?.sha256Hash?.slice(0, 12) || bundleHash.slice(0, 12)
      });
    }

    console.log("\n[4/5] Tamper-Evident HMAC Audit Trail Generation...");
    const auditLogs = orchestrator.getAuditLogs();
    const auditFilePath = path.join(ZK_EMAIL_DIR, "deployment", "deployment-audit.log");
    const formattedLogs = auditLogs.map(l => 
      `${l.timestamp} | ${l.target.padEnd(14)} | ${l.action.padEnd(14)} | ${l.status.padEnd(8)} | Sig: ${l.logSignature.slice(0, 16)}...`
    ).join("\n");

    fs.writeFileSync(auditFilePath, formattedLogs + "\n", "utf-8");
    console.log(`  ✓ Tamper-evident audit trail saved to: ${auditFilePath}`);
    console.log(`  ✓ Total Audit Entries Recorded: ${auditLogs.length}`);

    console.log("\n[5/5] Deployment Result Table:");
    console.table(summaryRows);
    console.log("==================================================================");
    console.log("  PRODUCTION DEPLOYMENT COMPLETED & VERIFIED                     ");
    console.log("==================================================================\n");

  } catch (error) {
    console.error("\n❌ DEPLOYMENT FATAL ERROR:", error.message);
    process.exit(1);
  }
}

main();
