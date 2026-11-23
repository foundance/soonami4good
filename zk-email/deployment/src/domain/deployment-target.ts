/**
 * Domain-Driven Deployment Target Port (Interface)
 * Strict adherence to SOLID, DRY, and Clean Architecture principles.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PlanStep {
  id: string;
  description: string;
  destructive: boolean;
  estimatedDurationSec: number;
}

export interface PlanResult {
  targetName: string;
  steps: PlanStep[];
  artifactChecksum: string;
}

export interface ExecutionResult {
  deploymentId: string;
  success: boolean;
  endpointUrl?: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface DeploymentStatus {
  deploymentId: string;
  state: "PENDING" | "ACTIVE" | "DEGRADED" | "FAILED" | "ROLLED_BACK";
  healthy: boolean;
  details: string;
}

export interface RollbackResult {
  success: boolean;
  previousDeploymentId: string;
  restoredAt: number;
}

export interface TeardownResult {
  success: boolean;
  resourcesDestroyed: string[];
}

export interface DeploymentContext {
  deploymentId: string;
  environment: "development" | "staging" | "production";
  artifactPath: string;
  artifactHash: string;
  secrets: Record<string, string>;
  dryRun: boolean;
}

/**
 * The ONE domain-level publish port/interface for all infrastructure targets.
 */
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
