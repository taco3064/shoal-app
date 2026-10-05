import {
  networkRoot,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';
import {
  hostedWorkflowPath,
  resolveHostedCapability,
} from '~app/protocol/services/hosted_capability';

import type { OidcClaims } from './oidc';
import type {
  BrokerIdentity,
  BrokerRepository,
  BrokerRequest,
  HostedBrokerGithub,
} from './types';

async function digest(bytes: Uint8Array | null): Promise<string | null> {
  if (!bytes || bytes.length > 131072) {
    return null;
  }

  const hash = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);

  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateRepository(
  request: BrokerRequest,
  repository: BrokerRepository,
  root: BrokerRepository,
): void {
  if (root.id !== String(networkRoot.repositoryId) || root.ownerType !== 'User'
    || root.private || repository.id !== request.repositoryId
    || repository.ownerId !== request.reviewerId || repository.ownerType !== 'User'
    || repository.private || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.fullName)
    || (repository.id !== root.id && repository.parentId !== root.id)) {
    throw new Error('EXECUTION_REFUSED');
  }
}

function validateClaims(input: {
  request: BrokerRequest;
  claims: OidcClaims;
  repository: BrokerRepository;
}): void {
  const { request, claims, repository } = input;
  const branchRef = `refs/heads/${repository.defaultBranch}`;
  const callerRef = `${repository.fullName}/${summaryWorkflowPath}@${branchRef}`;
  const auxiliaryRef = `${repository.fullName}/${hostedWorkflowPath}@${branchRef}`;

  const bindings = {
    repository: repository.fullName,
    repository_id: request.repositoryId,
    repository_owner_id: request.reviewerId,
    repository_owner: repository.fullName.split('/')[0],
    workflow_ref: callerRef,
    workflow_sha: request.workflowSha,
    run_id: request.runId,
    run_attempt: request.runAttempt,
    job_workflow_ref: auxiliaryRef,
    job_workflow_sha: request.workflowSha,
    ref: branchRef,
    ref_type: 'branch',
    sha: request.workflowSha,
    sub: `repo:${repository.fullName}:ref:${branchRef}`,
  };

  if (request.workflowRef !== callerRef
    || Object.entries(bindings).some(([name, value]) => claims[name] !== value)
    || !['schedule', 'workflow_dispatch'].includes(String(claims.event_name))) {
    throw new Error('EXECUTION_REFUSED');
  }
}

// Current Membership is independent of Hosted support. Both the caller and local
// reusable bytes are fetched at the authenticated execution SHA, never main/latest.
export async function authenticateExecution(input: {
  request: BrokerRequest;
  claims: OidcClaims;
  github: HostedBrokerGithub;
}): Promise<BrokerIdentity> {
  const { request, claims, github } = input;

  const [repository, root] = await Promise.all([
    github.getRepository(request.repositoryId),
    github.getRepository(String(networkRoot.repositoryId)),
  ]);

  validateRepository(request, repository, root);
  validateClaims({ request, claims, repository });

  const run = await github.getRun(repository.fullName, request.runId);

  if (run.id !== request.runId || run.repositoryId !== request.repositoryId
    || run.runAttempt !== request.runAttempt || run.status !== 'in_progress'
    || run.headSha !== request.workflowSha || run.headBranch !== repository.defaultBranch
    || run.path !== summaryWorkflowPath || run.event !== claims.event_name) {
    throw new Error('EXECUTION_REFUSED');
  }

  const [caller, auxiliary, mode] = await Promise.all([
    github.readWorkflow(repository.fullName, summaryWorkflowPath, request.workflowSha),
    github.readWorkflow(repository.fullName, hostedWorkflowPath, request.workflowSha),
    github.readMode(repository),
  ]);

  const [callerDigest, auxiliaryDigest] = await Promise.all([
    digest(caller), digest(auxiliary),
  ]);

  if (!resolveHostedCapability(callerDigest, auxiliaryDigest)
    || !['review', 're-review', 'all'].includes(mode ?? '')) {
    throw new Error('EXECUTION_REFUSED');
  }

  return {
    repositoryId: repository.id,
    reviewerId: repository.ownerId,
    repositoryFullName: repository.fullName,
  };
}
