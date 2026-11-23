/**
 * Domain-Driven Deployment Target Port (Interface documentation for JS)
 */

export class DeploymentTargetError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = "DeploymentTargetError";
    this.errors = errors;
  }
}
