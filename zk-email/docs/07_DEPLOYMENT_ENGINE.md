# 07. Domain-Driven Deployment Architecture (DDD, SOLID, DRY)

## 1. Architectural Principles & Constraints

The deployment engine adheres strictly to Domain-Driven Design (DDD), SOLID principles, and DRY (Don't Repeat Yourself) guidelines:
1. **Single Publish Port:** Exactly ONE domain-level interface (`DeploymentTarget`) defines the contract for all infrastructure destinations.
2. **One Adapter per Provider:** Infrastructure destinations (IPFS/Arweave, Cloudflare, Ethereum/EVM) implement the port as independent adapters without leaking provider-specific abstractions into the core domain.
3. **Centralized Shared Concerns:** All cross-cutting operations (artifact validation, retry policies, idempotency, audit trails, secrets resolution, and health verification) live **once** in the domain orchestrator, never duplicated across adapters.

Files:
- **Domain Port:** [deployment-target.ts](file:///d:/workspace/dapp/zk-circuit/zk-email/deployment/src/domain/deployment-target.ts)
- **Shared Orchestrator:** [orchestrator.ts](file:///d:/workspace/dapp/zk-circuit/zk-email/deployment/src/shared/orchestrator.ts)
- **Decentralized Storage Adapter:** [ipfs-arweave-adapter.ts](file:///d:/workspace/dapp/zk-circuit/zk-email/deployment/src/adapters/ipfs-arweave-adapter.ts)
- **Cloudflare Edge Adapter:** [cloudflare-adapter.ts](file:///d:/workspace/dapp/zk-circuit/zk-email/deployment/src/adapters/cloudflare-adapter.ts)
- **EVM Verifier Adapter:** [ethereum-evm-adapter.ts](file:///d:/workspace/dapp/zk-circuit/zk-email/deployment/src/adapters/ethereum-evm-adapter.ts)

---

## 2. The `DeploymentTarget` Domain Port

```typescript
export interface DeploymentTarget {
  readonly name: string;

  /** Validates target-specific configuration */
  validateConfig(config: Record<string, unknown>): Promise<ValidationResult>;

  /** Formulates a dry-run execution plan */
  plan(context: DeploymentContext): Promise<PlanResult>;

  /** Executes the plan to deploy the artifact */
  deploy(plan: PlanResult, context: DeploymentContext): Promise<ExecutionResult>;

  /** Checks current target health and status */
  status(deploymentId: string): Promise<DeploymentStatus>;

  /** Reverts to the immediately preceding verified deployment */
  rollback(deploymentId: string): Promise<RollbackResult>;

  /** Tears down resources on decommission */
  teardown(deploymentId: string): Promise<TeardownResult>;
}
```

---

## 3. The `DeploymentOrchestrator` (Shared Pipeline)

```
[Release Candidate Artifact]
           │
           ▼
[DeploymentOrchestrator]
  1. Computes SHA-256 Checksum
  2. Idempotency Check (skips duplicate hashes)
  3. Secrets Resolution (injects target secrets from Vault)
  4. Dry-Run Planning across target adapters
  5. Execution with Exponential Backoff & Jitter
  6. Post-Deployment Smoke Test & Health Check
  7. Cryptographic Audit Log Generation
           │
  ┌────────┼────────┐
  ▼        ▼        ▼
[IPFS] [Cloudflare] [Ethereum / Safe]
```

### 3.1 Idempotency Guarantee
The orchestrator tracks previously applied artifact hashes per adapter. If a target is already running the requested artifact hash and `dryRun` is false, redundant execution is bypassed:

```typescript
const lastHash = this.stateStore.get(targetName);
if (lastHash === artifactHash && !params.dryRun) {
  console.log(`Target ${targetName} already running ${artifactHash}. Skipping (Idempotent).`);
  continue;
}
```

### 3.2 Resilience & Exponential Backoff with Jitter
Network transients during deployment are handled by a shared backoff algorithm:

$$T_{\text{delay}} = T_{\text{base}} \cdot 2^{\text{attempt}} + \text{Uniform}(0, 200\text{ms})$$

### 3.3 Automated Health & Smoke Verification
Deployments do not finalize until the orchestrator polls `target.status(deploymentId)` and validates health invariants. If a health check fails, the orchestrator immediately triggers `target.rollback(deploymentId)`.
