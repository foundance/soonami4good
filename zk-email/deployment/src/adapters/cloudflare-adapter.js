export class CloudflareAdapter {
  constructor() {
    this.name = "cloudflare";
    this.activeDeployments = new Map();
    this.rollbackStack = [];
  }

  async validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config.accountId || typeof config.accountId !== "string") {
      errors.push("Missing or invalid 'accountId' parameter.");
    } else if (!/^[a-fA-F0-9]{32}$/.test(config.accountId)) {
      errors.push("accountId must be a 32-character hexadecimal string.");
    }

    if (config.zoneId && typeof config.zoneId === "string") {
      if (!/^[a-fA-F0-9]{32}$/.test(config.zoneId)) {
        errors.push("zoneId must be a 32-character hexadecimal string.");
      }
    } else {
      warnings.push("zoneId not specified; email routing rules will require manual binding in dashboard.");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  async plan(context) {
    return {
      targetName: this.name,
      steps: [
        {
          id: "bundle-email-worker",
          description: "Compile and bundle Cloudflare Email Worker (worker.js) for DKIM challenge interception",
          destructive: false,
          estimatedDurationSec: 4
        },
        {
          id: "publish-pages-edge",
          description: "Deploy static HTML/JS assets to Cloudflare Pages CDN edge",
          destructive: false,
          estimatedDurationSec: 7
        },
        {
          id: "configure-email-routing",
          description: "Verify email routing rule: verify-*@rationalprocess.eth -> Worker",
          destructive: false,
          estimatedDurationSec: 3
        }
      ],
      artifactChecksum: context.artifactHash
    };
  }

  async deploy(plan, context) {
    const workerVersion = `worker-v${Date.now()}-${context.artifactHash.slice(0, 8)}`;
    const pagesUrl = "https://rationalprocess.eth.limo";
    const routePattern = "verify-*@rationalprocess.eth";

    const record = {
      deploymentId: context.deploymentId,
      workerVersion,
      pagesUrl,
      routePattern,
      timestamp: Date.now()
    };

    this.activeDeployments.set(context.deploymentId, record);
    this.rollbackStack.push(record);

    return {
      deploymentId: context.deploymentId,
      success: true,
      endpointUrl: pagesUrl,
      metadata: {
        workerVersion,
        pagesUrl,
        routePattern,
        edgeRouting: "ACTIVE"
      },
      timestamp: Date.now()
    };
  }

  async status(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) {
      return {
        deploymentId,
        state: "FAILED",
        healthy: false,
        details: `No active deployment record found for ID '${deploymentId}'.`
      };
    }

    return {
      deploymentId,
      state: "ACTIVE",
      healthy: true,
      details: `Worker ${deployment.workerVersion} active; edge routing ${deployment.routePattern} online.`
    };
  }

  async rollback(deploymentId) {
    console.log(`[CloudflareAdapter] Initiating edge rollback for deployment '${deploymentId}'...`);
    if (this.rollbackStack.length > 1) {
      this.rollbackStack.pop();
      const prior = this.rollbackStack[this.rollbackStack.length - 1];
      console.log(`[CloudflareAdapter] Restored prior worker version '${prior.workerVersion}'.`);
      return {
        success: true,
        previousDeploymentId: prior.deploymentId,
        restoredAt: Date.now()
      };
    }

    return {
      success: true,
      previousDeploymentId: "worker_genesis_null",
      restoredAt: Date.now()
    };
  }

  async teardown(deploymentId) {
    const record = this.activeDeployments.get(deploymentId);
    this.activeDeployments.delete(deploymentId);
    this.rollbackStack = this.rollbackStack.filter(r => r.deploymentId !== deploymentId);

    return {
      success: true,
      resourcesDestroyed: record ? [`cf-worker:${record.workerVersion}`, `cf-route:${record.routePattern}`] : []
    };
  }
}
