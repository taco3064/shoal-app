import {
  networkRoot,
  requestFormPath,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';
import { stationReadiness } from '~app/protocol/services/station_readiness';
import type { StationReadinessReason } from '~app/protocol/services/station_readiness';
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
  stationStatus: StationStatus;
  stationReadinessReasons: StationReadinessReason[];
  summaryStatus: SelectedSummary['status'];
  summary: SelectedSummary;
};

export type NetworkProjection = {
  schemaVersion: 1;
  generatedAt: string;
  networkRoot: { repositoryId: number; repository: string };
  reviewers: ReviewerEntry[];
};

type DirectoryExclusionReason
  = 'not-unique-personal-root-or-direct-fork';

export type StationStatus = 'ready' | 'setup_required';

export type { StationReadinessReason } from '~app/protocol/services/station_readiness';

const stationReadinessReasons = new Set<StationReadinessReason>([
  'issues_disabled',
  'review_request_surface_missing_or_unsupported',
  'summary_workflow_missing_or_unsupported',
]);

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

    const { reasons } = stationReadiness({
      hasIssues: node.has_issues,
      formDigest: form ? hash(form) : null,
      workflowDigest: workflow ? hash(workflow) : null,
    });

    const stationStatus: StationStatus = reasons.length === 0
      ? 'ready'
      : 'setup_required';

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
      stationStatus,
      stationReadinessReasons: reasons,
      summaryStatus: summary.status,
      summary,
    });

    logStationReadiness(node, stationStatus, reasons);
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

function logStationReadiness(
  node: GitHubRepository,
  status: StationStatus,
  reasons: StationReadinessReason[],
): void {
  if (process.env.SHOAL_SCAN_DIAGNOSTICS === '1') {
    console.info(
      [
        'Station readiness',
        `reviewer=${node.full_name}`,
        `repositoryId=${node.id}`,
        `status=${status}`,
        `reasons=${reasons.length === 0 ? 'none' : reasons.join(',')}`,
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

    if (
      reviewer.stationStatus !== 'ready'
      && reviewer.stationStatus !== 'setup_required'
    ) {
      throw new Error('Invalid Reviewer Station Readiness status.');
    }

    if (
      !Array.isArray(reviewer.stationReadinessReasons)
      || reviewer.stationReadinessReasons.some((reason) =>
        !stationReadinessReasons.has(reason))
    ) {
      throw new Error('Invalid Reviewer Station Readiness reasons.');
    }

    if (
      reviewer.stationStatus === 'ready'
      && reviewer.stationReadinessReasons.length > 0
    ) {
      throw new Error('Ready Reviewer must not include readiness reasons.');
    }

    if (
      reviewer.stationStatus === 'setup_required'
      && reviewer.stationReadinessReasons.length === 0
    ) {
      throw new Error('Setup-required Reviewer must include readiness reasons.');
    }

    const selected = reviewer.summary;

    if (reviewer.summaryStatus !== selected.status) {
      throw new Error('Reviewer Summary status must match selected Summary.');
    }

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
