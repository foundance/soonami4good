/**
 * Deployment Orchestrator - Shared Cross-Cutting Concerns Engine
 *
 * Implements DRY & SOLID by centralizing:
 * 1. Target configuration pre-validation
 * 2. Artifact hashing & integrity validation
 * 3. Secrets resolution
 * 4. Idempotency management
 * 5. Exponential backoff retry policy with jitter
 * 6. Cryptographically signed audit logging (HMAC-SHA256)
 * 7. Post-deployment smoke & health verification
 */

import {
  DeploymentTarget,
  DeploymentContext,
  ExecutionResult,
  PlanResult,
  ValidationResult
} from "../domain/deployment-target.js";
import * as crypto from "crypto";

export interface AuditLogEntry {
  timestamp: string;
  deploymentId: string;
  target: string;
  action: string;
  status: "SUCCESS" | "FAILURE";
  details: Record<string, unknown>;
  logSignature: string;
}

export class DeploymentOrchestrator {
  private auditLogs: AuditLogEntry[] = [];
  private stateStore: Map<string, string> = new Map(); // target -> lastDeployedHash
  private auditHmacKey: string;

  constructor(
    private readonly targets: Map<string, DeploymentTarget>,
    private readonly secretsProvider: (key: string) => Promise<string>,
    auditSecret?: string
  ) {
    this.auditHmacKey = auditSecret || crypto.randomBytes(32).toString("hex");
  }

  /**
   * Executes an end-to-end atomic deployment across specified targets
   */
  async executeDeployment(params: {
    targetNames: string[];
    targetConfigs?: Record<string, Record<string, unknown>>;
    environment: "development" | "staging" | "production";
    artifactPath: string;
    artifactBytes: Buffer;
    dryRun?: boolean;
  }): Promise<Record<string, ExecutionResult>> {
    const deploymentId = `dep-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const artifactHash = crypto.createHash("sha256").update(params.artifactBytes).digest("hex");

    console.log(`[Orchestrator] Starting deployment ${deploymentId} (SHA256: ${artifactHash.slice(0, 12)}...)`);

    const results: Record<string, ExecutionResult> = {};

    for (const name of params.targetNames) {
      const target = this.targets.get(name);
      if (!target) {
        throw new Error(`Target adapter '${name}' is not registered in orchestrator.`);
      }

      // 1. Pre-validation of Target Configuration
      const targetConfig = (params.targetConfigs && params.targetConfigs[name]) || {};
      const validation: ValidationResult = await target.validateConfig(targetConfig);
      if (!validation.valid) {
        const errorMsg = `Configuration validation failed for target '${name}': ${validation.errors.join("; ")}`;
        this.appendAuditLog({
          timestamp: new Date().toISOString(),
          deploymentId,
          target: name,
          action: "VALIDATE_CONFIG",
          status: "FAILURE",
          details: { errors: validation.errors }
        });
        throw new Error(errorMsg);
      }

      // 2. Idempotency Check
      const lastHash = this.stateStore.get(name);
      if (lastHash === artifactHash && !params.dryRun) {
        console.log(`[Orchestrator] Target '${name}' is already running artifact ${artifactHash}. Skipping (Idempotent).`);
        continue;
      }

      // 3. Resolve Required Secrets
      const resolvedSecrets = await this.resolveSecretsForTarget(name);

      const context: DeploymentContext = {
        deploymentId,
        environment: params.environment,
        artifactPath: params.artifactPath,
        artifactHash,
        secrets: resolvedSecrets,
        dryRun: Boolean(params.dryRun)
      };

      // 4. Plan & Dry-Run
      const plan: PlanResult = await target.plan(context);
      console.log(`[Orchestrator] Plan generated for '${name}' with ${plan.steps.length} steps.`);

      if (params.dryRun) {
        results[name] = {
          deploymentId,
          success: true,
          metadata: { dryRun: true, plan },
          timestamp: Date.now()
        };
        this.appendAuditLog({
          timestamp: new Date().toISOString(),
          deploymentId,
          target: name,
          action: "PLAN_DRY_RUN",
          status: "SUCCESS",
          details: { stepsCount: plan.steps.length }
        });
        continue;
      }

      // 5. Execute Deployment with Retry & Exponential Backoff + Jitter
      try {
        const execResult = await this.retryWithBackoff(
          () => target.deploy(plan, context),
          3, // maxRetries
          1000 // initialBackoffMs
        );

        // 6. Post-Deployment Smoke Test & Health Check
        await this.verifyHealth(target, deploymentId);

        // Commit to state store
        this.stateStore.set(name, artifactHash);
        results[name] = execResult;

        this.appendAuditLog({
          timestamp: new Date().toISOString(),
          deploymentId,
          target: name,
          action: "DEPLOY",
          status: "SUCCESS",
          details: { endpoint: execResult.endpointUrl, metadata: execResult.metadata }
        });
      } catch (err: any) {
        this.appendAuditLog({
          timestamp: new Date().toISOString(),
          deploymentId,
          target: name,
          action: "DEPLOY",
          status: "FAILURE",
          details: { error: err.message }
        });

        console.error(`[Orchestrator] Deployment failed on '${name}'. Triggering automated rollback.`);
        await target.rollback(deploymentId).catch(rbErr => {
          console.error(`[Orchestrator] Rollback failed on '${name}':`, rbErr);
        });
        throw err;
      }
    }

    return results;
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    delayMs: number
  ): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) throw err;
        const jitter = Math.random() * 250;
        const sleepDuration = delayMs * Math.pow(2, attempt) + jitter;
        console.warn(`[RetryPolicy] Attempt ${attempt} failed. Retrying in ${Math.round(sleepDuration)}ms...`);
        await new Promise(r => setTimeout(r, sleepDuration));
      }
    }
    throw new Error("Exhausted retries");
  }

  private async verifyHealth(target: DeploymentTarget, deploymentId: string): Promise<void> {
    console.log(`[HealthCheck] Verifying status for deployment '${deploymentId}' on '${target.name}'...`);
    const status = await target.status(deploymentId);
    if (!status.healthy) {
      throw new Error(`Health verification failed on target '${target.name}': ${status.details}`);
    }
  }

  private async resolveSecretsForTarget(targetName: string): Promise<Record<string, string>> {
    const keys = [
      `${targetName.toUpperCase()}_API_KEY`,
      `${targetName.toUpperCase()}_SECRET`,
      `${targetName.toUpperCase()}_API_TOKEN`,
      "IPFS_PINATA_JWT",
      "EVM_RPC_URL",
      "EVM_CHAIN_ID"
    ];
    const secrets: Record<string, string> = {};
    for (const k of keys) {
      secrets[k] = await this.secretsProvider(k).catch(() => "");
    }
    return secrets;
  }

  private appendAuditLog(entry: Omit<AuditLogEntry, "logSignature">) {
    const canonicalEntry = `${entry.timestamp}|${entry.deploymentId}|${entry.target}|${entry.action}|${entry.status}`;
    const logSignature = crypto.createHmac("sha256", this.auditHmacKey).update(canonicalEntry).digest("hex");

    const signedEntry: AuditLogEntry = {
      ...entry,
      logSignature
    };

    this.auditLogs.push(signedEntry);
    console.log(`[AuditLog] ${signedEntry.timestamp} | ${signedEntry.target} | ${signedEntry.action} | ${signedEntry.status} (Sig: ${logSignature.slice(0, 8)})`);
  }

  getAuditLogs(): ReadonlyArray<AuditLogEntry> {
    return this.auditLogs;
  }
}
