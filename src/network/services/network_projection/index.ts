import {
  networkRoot,
  requestFormPath,
  summaryWorkflowPath,
  allowedCanonicalReviewRequestFormDigests,
  allowedSummaryWorkflows,
} from '~app/protocol/services/network_compatibility';
import type { GitHubRepository, WorkflowRun } from '../github_api';
import {
  hash,
  selectSummary,
  verifyGitHubAttestation,
} from '../summary_selection';
import type {
  AttestationVerifier,
  SelectedSummary,
  SummarySource,
} from '../summary_selection';

export type ReviewerEntry = {
  repositoryId: number;
  username: string;
  repository: string;
  repositoryUrl: string;
  avatarUrl: string;
  profileUrl: string;
  joinedAt: string;
  policyUrl: string;
  summary: SelectedSummary;
};

export type NetworkProjection = {
  schemaVersion: 1;
  generatedAt: string;
  networkRoot: { repositoryId: number; repository: string };
  reviewers: ReviewerEntry[];
};

export interface NetworkSource extends SummarySource {
  repository(fullName: string): Promise<GitHubRepository>;
  pages<T>(path: string, key?: string): Promise<T[]>;
  json<T>(path: string): Promise<T>;
  summaryRuns(fullName: string): Promise<WorkflowRun[]>;
}

export function isMember(node: GitHubRepository): boolean {
  return (
    node.id !== networkRoot.repositoryId
    && node.fork === true
    && node.owner?.type === 'User'
    && node.parent?.id === networkRoot.repositoryId
  );
}

export async function buildNetworkProjection(
  source: NetworkSource,
  generatedAt = new Date().toISOString(),
  verifier: AttestationVerifier = verifyGitHubAttestation,
): Promise<NetworkProjection> {
  const root = await source.repository(networkRoot.fullName);

  if (root.id !== networkRoot.repositoryId) {
    throw new Error('Network Root identity mismatch.');
  }

  const forks = await source.pages<GitHubRepository>(
    `/repos/${networkRoot.fullName}/forks`,
  );

  const reviewers: ReviewerEntry[] = [];
  const seen = new Set<number>();

  for (const fork of forks) {
    const node = await source.repository(fork.full_name);

    if (!isMember(node) || seen.has(node.id)) {
      logSkip(node, 'not a unique direct personal fork');

      continue;
    }

    seen.add(node.id);

    if (!node.has_issues) {
      logSkip(node, 'Issues disabled');

      continue;
    }

    const commit = await source.json<{ sha: string }>(
      `/repos/${node.full_name}/commits/${encodeURIComponent(node.default_branch)}`,
    );

    if (!/^[a-f0-9]{40}$/.test(commit.sha)) {
      throw new Error('Invalid default branch commit.');
    }

    const [form, workflow] = await Promise.all([
      source.committedBytes(node.full_name, requestFormPath, commit.sha),
      source.committedBytes(node.full_name, summaryWorkflowPath, commit.sha),
    ]);

    if (!form || !workflow) {
      logSkip(node, 'canonical Request Form or Summary Workflow missing');

      continue;
    }

    if (!allowedCanonicalReviewRequestFormDigests.has(hash(form))) {
      logSkip(node, 'Request Form digest not supported');

      continue;
    }

    if (!allowedSummaryWorkflows.has(hash(workflow))) {
      logSkip(node, 'Summary Workflow digest not allowed');

      continue;
    }

    const runs = await source.summaryRuns(node.full_name);
    const summary = await selectSummary(node, runs, source, verifier);

    reviewers.push({
      repositoryId: node.id,
      username: node.owner.login,
      repository: node.full_name,
      repositoryUrl: node.html_url,
      avatarUrl: node.owner.avatar_url,
      profileUrl: node.owner.html_url,
      joinedAt: node.created_at,
      policyUrl: `${node.html_url}/blob/${commit.sha}/README.md`,
      summary,
    });
  }

  reviewers.sort(
    (a, b) =>
      a.username.toLowerCase().localeCompare(b.username.toLowerCase(), 'en')
      || a.repositoryId - b.repositoryId,
  );

  const projection: NetworkProjection = {
    schemaVersion: 1,
    generatedAt,
    networkRoot: { repositoryId: root.id, repository: root.full_name },
    reviewers,
  };

  validateProjection(projection);

  return projection;
}

function logSkip(node: GitHubRepository, reason: string): void {
  if (process.env.SHOAL_SCAN_DIAGNOSTICS === '1') {
    console.info(`Excluded ${node.full_name}: ${reason}`);
  }
}

export function sortByJoinedAt(reviewers: ReviewerEntry[]): ReviewerEntry[] {
  return [...reviewers].sort(
    (a, b) =>
      a.joinedAt.localeCompare(b.joinedAt) || a.repositoryId - b.repositoryId,
  );
}

export function validateProjection(projection: NetworkProjection): void {
  if (
    projection.schemaVersion !== 1
    || Number.isNaN(Date.parse(projection.generatedAt))
  ) {
    throw new Error('Invalid Network Projection metadata.');
  }

  const identities = new Set<number>();

  for (const reviewer of projection.reviewers) {
    if (
      !Number.isSafeInteger(reviewer.repositoryId)
      || reviewer.repositoryId <= 0
      || identities.has(reviewer.repositoryId)
      || reviewer.repositoryId === networkRoot.repositoryId
      || !reviewer.username
      || !reviewer.repository
      || !reviewer.avatarUrl
      || Number.isNaN(Date.parse(reviewer.joinedAt))
    ) {
      throw new Error('Invalid or duplicate Reviewer Projection entry.');
    }

    identities.add(reviewer.repositoryId);
    const selected = reviewer.summary;

    if (
      selected.status === 'unavailable'
      && ('summary' in selected || 'source' in selected)
    ) {
      throw new Error('Unavailable Summary must not include metrics.');
    }

    if (selected.status === 'fallback' && !selected.stale) {
      throw new Error('Fallback Summary must be stale.');
    }

    if (selected.status === 'current' && selected.stale) {
      throw new Error('Current Summary must not be stale.');
    }
  }
}
