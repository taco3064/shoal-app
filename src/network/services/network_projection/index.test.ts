import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { GitHubRepository, WorkflowRun } from '../github_api';
import { hash } from '../summary_selection';
import {
  buildNetworkProjection,
  sortByJoinedAt,
  validateProjection,
} from './index';
import type { NetworkProjection, NetworkSource } from './index';
import {
  allowedSummaryWorkflows,
  currentReviewerSummaryContract,
  isSupportedReviewerSummaryContract,
  networkRoot,
  requestFormPath,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';

const form = readFileSync(
  new URL('./fixtures/review-request.yml', import.meta.url),
);

const workflow = readFileSync(
  new URL('./fixtures/reviewer-summary.yml', import.meta.url),
);

const station11Workflow = readFileSync(
  new URL(
    '../summary_selection/fixtures/reviewer-summary-station-11.yml',
    import.meta.url,
  ),
);

const sha = 'a'.repeat(40);

const root = {
  ...makeNode(networkRoot.repositoryId, networkRoot.fullName),
  fork: false,
  parent: undefined,
  has_issues: false,
};

const current = makeNode(12, 'alice/node');
const later = makeNode(13, 'zoe/node');

function makeNode(id: number, fullName: string): GitHubRepository {
  const login = fullName.split('/')[0];

  return {
    id,
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    created_at: '2026-09-01T00:00:00Z',
    default_branch: 'main',
    fork: true,
    has_issues: true,
    parent: { id: networkRoot.repositoryId },
    owner: {
      login,
      type: 'User',
      avatar_url: `https://avatars.githubusercontent.com/${login}`,
      html_url: `https://github.com/${login}`,
    },
  };
}

function makeRun(
  id: number,
  started: string,
  conclusion = 'success',
): WorkflowRun {
  return {
    id,
    path: summaryWorkflowPath,
    repository: { id: current.id },
    head_repository: { id: current.id },
    head_sha: sha,
    run_attempt: 1,
    run_started_at: started,
    status: 'completed',
    conclusion,
    html_url: `https://github.com/alice/node/actions/runs/${id}`,
  };
}

function source(
  nodes: GitHubRepository[],
  runs: WorkflowRun[] = [],
  rootNode: GitHubRepository = root,
): NetworkSource {
  return {
    async repository(fullName) {
      const found = [rootNode, ...nodes].find(
        (node) => node.full_name === fullName,
      );

      if (!found) {
        throw new Error('Required repository read failed.');
      }

      return found;
    },
    async pages() {
      return nodes as never[];
    },
    async json() {
      return { sha } as never;
    },
    async committedBytes(_name, path) {
      if (path === requestFormPath) {
        return form;
      }

      if (path === summaryWorkflowPath) {
        return workflow;
      }

      throw new Error(`Unexpected path: ${path}`);
    },
    async summaryRuns() {
      return runs;
    },
    async runAttempt() {
      throw new Error('Unexpected rerun.');
    },
    async publicSummary(fullName, repositoryId, runId, attempt) {
      return {
        bytes: new TextEncoder().encode(
          JSON.stringify({
            protocolVersion: 1,
            summarySchemaVersion: 1,
            reviewerNode: { repositoryId },
            metrics: {
              reviewBackedStarCount: 1,
              validReviewRequestIssueCount: 2,
              reReviewRequestIssueCount: 1,
              invalidReviewCommentCount: 3,
            },
          }),
        ),
        url: `https://raw.githubusercontent.com/${fullName}/shoal-summary-${repositoryId}-${runId}-${attempt}/reviewer-summary.json`,
      };
    },
  };
}

const workflowTrust = allowedSummaryWorkflows.get(hash(workflow));
const station11Trust = allowedSummaryWorkflows.get(hash(station11Workflow));

test('flat membership projects valid nodes and excludes invalid lineage', async () => {
  const disabled = { ...later, has_issues: false };

  const downstream = {
    ...makeNode(14, 'other/downstream'),
    parent: { id: current.id },
    source: { id: networkRoot.repositoryId },
  };

  const organization = {
    ...makeNode(15, 'org/node'),
    owner: { ...current.owner, type: 'Organization' },
  };

  const projection = await buildNetworkProjection(
    source([current, disabled, downstream, organization, root]),
    '2026-09-29T00:00:00Z',
  );

  assert.deepEqual(
    projection.reviewers.map((reviewer) => reviewer.repositoryId),
    [12, root.id, 13],
  );

  const currentReviewer = projection.reviewers.find(
    (reviewer) => reviewer.repositoryId === current.id,
  );

  const disabledReviewer = projection.reviewers.find(
    (reviewer) => reviewer.repositoryId === disabled.id,
  );

  assert.equal(currentReviewer?.summary.status, 'unavailable');
  assert.equal('metrics' in currentReviewer!.summary, false);
  assert.equal(currentReviewer?.joinedAt, current.created_at);

  assert.equal(currentReviewer?.stationStatus, 'ready');
  assert.deepEqual(currentReviewer?.stationReadinessReasons, []);

  assert.equal(disabledReviewer?.stationStatus, 'setup_required');

  assert.deepEqual(disabledReviewer?.stationReadinessReasons, [
    'issues_disabled',
  ]);
});

test('eligible personal Root joins with its own identity and Summary', async () => {
  const eligibleRoot = { ...root, has_issues: true };

  const rootRun = {
    ...makeRun(40, '2026-09-29T10:00:00Z'),
    repository: { id: root.id },
    head_repository: { id: root.id },
  };

  const projection = await buildNetworkProjection(
    source([current], [rootRun], eligibleRoot),
    '2026-09-29T11:00:00Z',
    async () => true,
  );

  assert.deepEqual(
    projection.reviewers.map((reviewer) => reviewer.username),
    ['alice', 'taco3064'],
  );

  const rootReviewer = projection.reviewers.find(
    (reviewer) => reviewer.repositoryId === root.id,
  );

  assert.equal(rootReviewer?.repository, networkRoot.fullName);
  assert.equal(rootReviewer?.joinedAt, root.created_at);
  assert.equal(rootReviewer?.stationStatus, 'ready');
  assert.deepEqual(rootReviewer?.stationReadinessReasons, []);
  assert.equal(rootReviewer?.summary.status, 'current');

  if (rootReviewer?.summary.status === 'current') {
    assert.equal(rootReviewer.summary.summary.reviewerNode.repositoryId, root.id);
    assert.equal(rootReviewer.summary.source.runId, rootRun.id);
    assert.equal(rootReviewer.summary.source.actionCommit, workflowTrust?.actionCommit);

    assert.deepEqual(
      workflowTrust?.reviewerSummary,
      currentReviewerSummaryContract,
    );
  }
});

test('accepted station#11 Summary projects through normal current state', async () => {
  const station11Run = makeRun(70, '2026-10-01T10:05:57Z');
  const station11Source = source([current], [station11Run]);

  const originalCommittedBytes = station11Source.committedBytes;

  station11Source.committedBytes = async (fullName, path, ref) => {
    if (path === summaryWorkflowPath) {
      return station11Workflow;
    }

    return originalCommittedBytes(fullName, path, ref);
  };

  const projection = await buildNetworkProjection(
    station11Source,
    '2026-10-01T11:00:00Z',
    async () => true,
  );

  const reviewer = projection.reviewers.find(
    (entry) => entry.repositoryId === current.id,
  );

  assert.equal(reviewer?.stationStatus, 'ready');
  assert.deepEqual(reviewer?.stationReadinessReasons, []);
  assert.equal(reviewer?.summary.status, 'current');

  if (reviewer?.summary.status === 'current') {
    assert.equal(reviewer.summary.source.workflowDigest, hash(station11Workflow));
    assert.equal(reviewer.summary.source.actionCommit, station11Trust?.actionCommit);

    assert.deepEqual(
      station11Trust?.reviewerSummary,
      currentReviewerSummaryContract,
    );
  }
});

test('Organization-owned Roots stay out and setup-required Roots stay in', async () => {
  const organizationRoot = {
    ...root,
    has_issues: true,
    owner: { ...root.owner, type: 'Organization' },
  };

  const organization = await buildNetworkProjection(
    source([current], [], organizationRoot),
  );

  const ineligible = await buildNetworkProjection(source([current]));

  assert.deepEqual(
    organization.reviewers.map((entry) => entry.repositoryId),
    [current.id],
  );

  assert.deepEqual(
    ineligible.reviewers.map((entry) => entry.repositoryId),
    [current.id, root.id],
  );

  assert.equal(
    ineligible.reviewers.find((entry) => entry.repositoryId === root.id)
      ?.stationStatus,
    'setup_required',
  );
});

test('latest rejected attempt keeps a verified stale fallback', async () => {
  const newest = makeRun(20, '2026-09-29T10:00:00Z', 'failure');
  const prior = makeRun(19, '2026-09-28T10:00:00Z');

  const pending = {
    ...makeRun(21, '2026-09-30T10:00:00Z'),
    status: 'in_progress',
    conclusion: null,
  };

  const unrelated = {
    ...makeRun(22, '2026-09-30T12:00:00Z'),
    path: 'other.yml',
  };

  const projection = await buildNetworkProjection(
    source([current], [prior, newest, pending, unrelated]),
    '2026-09-29T00:00:00Z',
    async () => true,
  );

  const selected = projection.reviewers[0].summary;

  assert.equal(selected.status, 'fallback');
  assert.equal(selected.stale, true);
  assert.equal(selected.source.runId, 19);

  assert.deepEqual(selected.summary.metrics, {
    invalidReviewCommentCount: 3,
    reReviewRequestIssueCount: 1,
    reviewBackedStarCount: 1,
    validReviewRequestIssueCount: 2,
  });
});

test('unsupported Summary contract falls back without mutating evidence', async () => {
  const newest = makeRun(20, '2026-09-29T10:00:00Z');
  const prior = makeRun(19, '2026-09-28T10:00:00Z');
  const api = source([current], [prior, newest]);
  const originalTransport = api.publicSummary.bind(api);

  api.publicSummary = async (fullName, repositoryId, runId, attempt) => {
    if (runId !== newest.id) {
      return originalTransport(fullName, repositoryId, runId, attempt);
    }

    return {
      bytes: new TextEncoder().encode(
        JSON.stringify({
          protocolVersion: 999,
          summarySchemaVersion: 1,
          reviewerNode: { repositoryId },
          metrics: {
            reviewBackedStarCount: 0,
            validReviewRequestIssueCount: 0,
            reReviewRequestIssueCount: 0,
            invalidReviewCommentCount: 0,
          },
        }),
      ),
      url: `https://raw.githubusercontent.com/${fullName}/shoal-summary-${repositoryId}-${runId}-${attempt}/reviewer-summary.json`,
    };
  };

  const projection = await buildNetworkProjection(
    api,
    '2026-09-29T00:00:00Z',
    async () => true,
  );

  const selected = projection.reviewers[0].summary;

  assert.equal(selected.status, 'fallback');
  assert.equal(selected.source.runId, prior.id);
  assert.equal(selected.source.runAttempt, 1);

  assert.deepEqual(selected.summary.metrics, {
    invalidReviewCommentCount: 3,
    reReviewRequestIssueCount: 1,
    reviewBackedStarCount: 1,
    validReviewRequestIssueCount: 2,
  });
});

test('Reviewer Summary compatibility is explicit and evolvable', () => {
  assert.equal(
    isSupportedReviewerSummaryContract(currentReviewerSummaryContract),
    true,
  );

  assert.equal(
    isSupportedReviewerSummaryContract({
      protocolVersion: 999,
      summarySchemaVersion: 1,
    }),
    false,
  );

  assert.equal(
    isSupportedReviewerSummaryContract({
      protocolVersion: 1,
      summarySchemaVersion: 999,
    }),
    false,
  );

  assert.equal(
    isSupportedReviewerSummaryContract(
      { protocolVersion: 1, summarySchemaVersion: 2 },
      [
        currentReviewerSummaryContract,
        { protocolVersion: 1, summarySchemaVersion: 2 },
      ],
    ),
    true,
  );
});

test('attestation rejection and incomplete reads have distinct outcomes', async () => {
  const projection = await buildNetworkProjection(
    source([current], [makeRun(19, '2026-09-28T10:00:00Z')]),
    '2026-09-29T00:00:00Z',
    async () => false,
  );

  assert.deepEqual(projection.reviewers[0].summary, {
    status: 'unavailable',
    stale: false,
  });

  const broken = source([current]);

  broken.pages = async () => {
    throw new Error('Fork pagination incomplete.');
  };

  await assert.rejects(buildNetworkProjection(broken), /pagination incomplete/);
});

test('stable identity and chronological ordering survive rename', async () => {
  const renamed = { ...current, full_name: 'alice/renamed-node' };
  const projection = await buildNetworkProjection(source([renamed, later]));

  assert.equal(projection.reviewers[0].repositoryId, current.id);
  assert.equal(projection.reviewers[0].repository, renamed.full_name);

  assert.deepEqual(
    sortByJoinedAt(projection.reviewers).map((entry) => entry.repositoryId),
    [current.id, later.id, root.id],
  );
});

test('rerun attempt ordering selects the latest accepted attempt', async () => {
  const rerun = { ...makeRun(31, '2026-09-29T10:00:00Z'), run_attempt: 2 };
  const api = source([current], [rerun]);

  api.runAttempt = async (_fullName, runId, attempt) => ({
    ...makeRun(runId, '2026-09-28T10:00:00Z'),
    run_attempt: attempt,
  });

  const originalTransport = api.publicSummary.bind(api);

  api.publicSummary = async (name, repositoryId, runId, attempt) =>
    attempt === 2
      ? originalTransport(name, repositoryId, runId, attempt)
      : null;

  const projection = await buildNetworkProjection(
    api,
    '2026-09-29T00:00:00Z',
    async () => true,
  );

  const selected = projection.reviewers[0].summary;

  assert.equal(selected.status, 'current');

  if ('source' in selected) {
    assert.equal(selected.source.runAttempt, 2);
  }
});

test('managed-surface drift keeps membership and records setup reasons', async () => {
  const api = source([current]);
  const original = api.committedBytes.bind(api);

  api.committedBytes = async (fullName, path, ref) => {
    if (path === requestFormPath) {
      return new Uint8Array([...form, 10]);
    }

    if (path === summaryWorkflowPath) {
      return null;
    }

    return original(fullName, path, ref);
  };

  const projection = await buildNetworkProjection(api);

  const reviewer = projection.reviewers.find((entry) =>
    entry.repositoryId === current.id);

  assert.equal(reviewer?.stationStatus, 'setup_required');

  assert.deepEqual(reviewer?.stationReadinessReasons, [
    'review_request_surface_missing_or_unsupported',
    'summary_workflow_missing_or_unsupported',
  ]);
});

test('setup-required reviewers retain independent summaries', async () => {
  const currentRun = makeRun(20, '2026-09-29T10:00:00Z');

  const currentApi = source(
    [{ ...current, has_issues: false }],
    [currentRun],
  );

  const currentProjection = await buildNetworkProjection(
    currentApi,
    '2026-09-29T00:00:00Z',
    async () => true,
  );

  assert.equal(currentProjection.reviewers[0].stationStatus, 'setup_required');
  assert.equal(currentProjection.reviewers[0].summary.status, 'current');

  const newest = makeRun(22, '2026-09-30T10:00:00Z', 'failure');
  const prior = makeRun(21, '2026-09-29T10:00:00Z');
  const fallbackApi = source([{ ...current, has_issues: false }], [prior, newest]);

  const fallbackProjection = await buildNetworkProjection(
    fallbackApi,
    '2026-09-30T00:00:00Z',
    async () => true,
  );

  assert.equal(fallbackProjection.reviewers[0].stationStatus, 'setup_required');
  assert.equal(fallbackProjection.reviewers[0].summary.status, 'fallback');
});

test('projection validation enforces Station Readiness contract', () => {
  const base: NetworkProjection = {
    schemaVersion: 1,
    generatedAt: '2026-09-29T00:00:00Z',
    networkRoot: { repositoryId: root.id, repository: root.full_name },
    reviewers: [
      {
        repositoryId: current.id,
        username: 'alice',
        repository: current.full_name,
        repositoryUrl: current.html_url,
        avatarUrl: current.owner.avatar_url,
        profileUrl: current.owner.html_url,
        joinedAt: current.created_at,
        policyUrl: `${current.html_url}/blob/${sha}/README.md`,
        stationStatus: 'ready',
        stationReadinessReasons: [],
        summaryStatus: 'unavailable',
        summary: { status: 'unavailable', stale: false },
      },
    ],
  };

  assert.doesNotThrow(() => validateProjection(base));

  assert.throws(
    () => validateProjection({
      ...base,
      reviewers: [{
        ...base.reviewers[0],
        stationStatus: 'ready',
        stationReadinessReasons: ['issues_disabled'],
      }],
    }),
    /Ready Reviewer must not include readiness reasons/,
  );

  assert.throws(
    () => validateProjection({
      ...base,
      reviewers: [{
        ...base.reviewers[0],
        stationStatus: 'setup_required',
        stationReadinessReasons: [],
      }],
    }),
    /Setup-required Reviewer must include readiness reasons/,
  );

  assert.throws(
    () => validateProjection({
      ...base,
      reviewers: [{
        ...base.reviewers[0],
        stationStatus: 'setup_required',
        stationReadinessReasons: ['not_a_reason'] as never,
      }],
    }),
    /Invalid Reviewer Station Readiness reasons/,
  );
});

test('scan diagnostics expose stable reason categories when enabled', async () => {
  const previous = process.env.SHOAL_SCAN_DIAGNOSTICS;
  const logs: string[] = [];
  const originalInfo = console.info;

  process.env.SHOAL_SCAN_DIAGNOSTICS = '1';

  console.info = (message?: unknown) => {
    logs.push(String(message));
  };

  try {
    await buildNetworkProjection(
      source(
        [
          { ...current, has_issues: false },
          later,
        ],
        [
          {
            ...makeRun(19, '2026-09-28T10:00:00Z', 'failure'),
            repository: { id: later.id },
            head_repository: { id: later.id },
          },
        ],
      ),
      '2026-09-29T00:00:00Z',
      async () => true,
    );
  } finally {
    console.info = originalInfo;

    if (previous === undefined) {
      delete process.env.SHOAL_SCAN_DIAGNOSTICS;
    } else {
      process.env.SHOAL_SCAN_DIAGNOSTICS = previous;
    }
  }

  assert.equal(
    logs.some((line) =>
      line.includes('Station readiness')
      && line.includes('reason')
      && line.includes('issues_disabled')),
    true,
  );

  assert.equal(
    logs.some((line) => line.includes('reason=execution-not-success')),
    true,
  );

  assert.equal(
    logs.some((line) => line.includes('reason=selected-unavailable')),
    true,
  );
});
