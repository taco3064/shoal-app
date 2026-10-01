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

type DirectoryExclusionReason
  = | 'not-unique-personal-root-or-direct-fork'
    | 'issues-disabled'
    | 'managed-files-missing'
    | 'request-form-digest-unsupported'
    | 'summary-workflow-digest-unsupported';

export interface NetworkSource extends SummarySource {
  repository(fullName: string): Promise<GitHubRepository>;
  pages<T>(path: string, key?: string): Promise<T[]>;
  json<T>(path: string): Promise<T>;
  summaryRuns(fullName: string): Promise<WorkflowRun[]>;
}

export function isMember(node: GitHubRepository): boolean {
  return (
    node.owner?.type === 'User'
    && (
      node.id === networkRoot.repositoryId
      || (node.fork === true && node.parent?.id === networkRoot.repositoryId)
    )
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

  for (const candidate of [root, ...forks]) {
    const node = candidate.id === root.id
      ? root
      : await source.repository(candidate.full_name);

    if (!isMember(node) || seen.has(node.id)) {
      logSkip(node, 'not-unique-personal-root-or-direct-fork');

      continue;
    }

    seen.add(node.id);

    if (!node.has_issues) {
      logSkip(node, 'issues-disabled');

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
      logSkip(node, 'managed-files-missing');

      continue;
    }

    if (!allowedCanonicalReviewRequestFormDigests.has(hash(form))) {
      logSkip(node, 'request-form-digest-unsupported');

      continue;
    }

    if (!allowedSummaryWorkflows.has(hash(workflow))) {
      logSkip(node, 'summary-workflow-digest-unsupported');

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

function logSkip(
  node: GitHubRepository,
  reason: DirectoryExclusionReason,
): void {
  if (process.env.SHOAL_SCAN_DIAGNOSTICS === '1') {
    console.info(
      [
        'Directory decision',
        `reviewer=${node.full_name}`,
        `repositoryId=${node.id}`,
        `reason=${reason}`,
      ].join(' '),
    );
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
