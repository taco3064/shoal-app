import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { GitHubRepository, WorkflowRun } from '../github_api';
import { buildNetworkProjection, sortByJoinedAt } from './index';
import type { NetworkSource } from './index';
import {
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

const sha = 'a'.repeat(40);
const root = makeNode(networkRoot.repositoryId, networkRoot.fullName);
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
): NetworkSource {
  return {
    async repository(fullName) {
      const found = [root, ...nodes].find(
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
            reviewerNode: { repositoryId: current.id },
            metrics: {
              reviewBackedStarCount: 1,
              validReviewRequestIssueCount: 2,
              reReviewRequestIssueCount: 1,
              invalidReviewCommentCount: 3,
            },
          }),
        ),
        url: `https://github.com/${fullName}/releases/download/shoal-summary-${repositoryId}-${runId}-${attempt}/reviewer-summary.json`,
        releaseId: runId,
        assetId: attempt,
      };
    },
  };
}

test('flat membership and observable eligibility exclude invalid nodes', async () => {
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
    [12],
  );

  assert.equal(projection.reviewers[0].summary.status, 'unavailable');
  assert.equal('metrics' in projection.reviewers[0].summary, false);
  assert.equal(projection.reviewers[0].joinedAt, current.created_at);
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
    [current.id, later.id],
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

test('managed-file byte drift removes directory eligibility', async () => {
  const api = source([current]);
  const original = api.committedBytes.bind(api);

  api.committedBytes = async (fullName, path, ref) =>
    path === requestFormPath
      ? new Uint8Array([...form, 10])
      : original(fullName, path, ref);

  const projection = await buildNetworkProjection(api);

  assert.deepEqual(projection.reviewers, []);
});
