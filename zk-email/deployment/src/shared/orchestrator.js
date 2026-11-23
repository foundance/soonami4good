import * as crypto from "crypto";

export class DeploymentOrchestrator {
  constructor(targets, secretsProvider, auditSecret) {
    this.targets = targets;
    this.secretsProvider = secretsProvider;
    this.stateStore = new Map();
    this.auditLogs = [];
    this.auditHmacKey = auditSecret || crypto.randomBytes(32).toString("hex");
  }

  async executeDeployment(params) {
    const deploymentId = `dep-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const artifactHash = crypto.createHash("sha256").update(params.artifactBytes).digest("hex");

    console.log(`[Orchestrator] Starting deployment ${deploymentId} (SHA256: ${artifactHash.slice(0, 12)}...)`);

    const results = {};

    for (const name of params.targetNames) {
      const target = this.targets.get(name);
      if (!target) {
        throw new Error(`Target adapter '${name}' is not registered in orchestrator.`);
      }

      // 1. Pre-validation of Target Configuration
      const targetConfig = (params.targetConfigs && params.targetConfigs[name]) || {};
      const validation = await target.validateConfig(targetConfig);
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

      const context = {
        deploymentId,
        environment: params.environment,
        artifactPath: params.artifactPath,
        artifactHash,
        secrets: resolvedSecrets,
        dryRun: Boolean(params.dryRun)
      };

      // 4. Plan & Dry-Run
      const plan = await target.plan(context);
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
          3,
          1000
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
      } catch (err) {
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

  async retryWithBackoff(fn, maxRetries, delayMs) {
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

  async verifyHealth(target, deploymentId) {
    console.log(`[HealthCheck] Verifying status for deployment '${deploymentId}' on '${target.name}'...`);
    const status = await target.status(deploymentId);
    if (!status.healthy) {
      throw new Error(`Health verification failed on target '${target.name}': ${status.details}`);
    }
  }

  async resolveSecretsForTarget(targetName) {
    const keys = [
      `${targetName.toUpperCase()}_API_KEY`,
      `${targetName.toUpperCase()}_SECRET`,
      `${targetName.toUpperCase()}_API_TOKEN`,
      "IPFS_PINATA_JWT",
      "EVM_RPC_URL",
      "EVM_CHAIN_ID"
    ];
    const secrets = {};
    for (const k of keys) {
      secrets[k] = await this.secretsProvider(k).catch(() => "");
    }
    return secrets;
  }

  appendAuditLog(entry) {
    const canonicalEntry = `${entry.timestamp}|${entry.deploymentId}|${entry.target}|${entry.action}|${entry.status}`;
    const logSignature = crypto.createHmac("sha256", this.auditHmacKey).update(canonicalEntry).digest("hex");

    const signedEntry = {
      ...entry,
      logSignature
    };

    this.auditLogs.push(signedEntry);
    console.log(`[AuditLog] ${signedEntry.timestamp} | ${signedEntry.target} | ${signedEntry.action} | ${signedEntry.status} (Sig: ${logSignature.slice(0, 8)})`);
  }

  getAuditLogs() {
    return this.auditLogs;
  }
}
