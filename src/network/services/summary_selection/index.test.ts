import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summaryWorkflowPath } from '~app/protocol/services/network_compatibility';
import { createReviewerSummary } from '~app/protocol/services/reviewer_summary_schema';
import type { GitHubRepository, WorkflowRun } from '../github_api';
import { selectSummary } from './index';
import type { SummarySource } from './index';

const node: GitHubRepository = {
  id: 123,
  full_name: 'reviewer/station',
  html_url: 'https://github.com/reviewer/station',
  created_at: '2026-09-01T00:00:00Z',
  default_branch: 'main',
  fork: true,
  has_issues: true,
  owner: {
    login: 'reviewer',
    type: 'User',
    avatar_url: 'https://example.test/avatar',
    html_url: 'https://github.com/reviewer',
  },
};

const oldSummary = {
  protocolVersion: 1,
  summarySchemaVersion: 1,
  reviewerNode: { repositoryId: node.id },
  metrics: {
    reviewBackedStarCount: 1,
    validReviewRequestIssueCount: 2,
    reReviewRequestIssueCount: 0,
    invalidReviewCommentCount: 0,
  },
};

const workloadSummary = createReviewerSummary(node.id, {
  ...oldSummary.metrics,
  pendingReviewRequestCount: 1,
  completedReviewRequestCount: 1,
});

function run(id: number): WorkflowRun {
  return {
    id,
    path: summaryWorkflowPath,
    repository: { id: node.id },
    head_repository: { id: node.id },
    head_sha: 'a'.repeat(40),
    run_attempt: 1,
    run_started_at: `2026-09-${String(id).padStart(2, '0')}T00:00:00Z`,
    status: 'completed',
    conclusion: 'success',
    html_url: `https://github.com/reviewer/station/actions/runs/${id}`,
  };
}

function source(summaries: Map<number, unknown>, fixture: string): SummarySource {
  const workflowBytes = readFileSync(new URL(fixture, import.meta.url));

  return {
    async runAttempt() {
      throw new Error('Single-attempt fixture must not enumerate other attempts.');
    },
    async committedBytes() {
      return workflowBytes;
    },
    async publicSummary(_fullName, _repositoryId, id) {
      return {
        bytes: new TextEncoder().encode(JSON.stringify(summaries.get(id))),
        url: `https://example.test/summary/${id}`,
      };
    },
  };
}

for (const fixture of [
  './fixtures/reviewer-summary-station-9.yml',
  './fixtures/reviewer-summary-station-11.yml',
]) {
  test(`exact trusted ${fixture} accepts v1 and preserves absent workload`, async () => {
    const selected = await selectSummary(
      node,
      [run(1)],
      source(new Map([[1, oldSummary]]), fixture),
      async () => true,
    );

    assert.equal(selected.status, 'current');

    assert.deepEqual(selected.summary, oldSummary);
    assert.equal(selected.summary.summarySchemaVersion, 1);
    assert.equal('pendingReviewRequestCount' in selected.summary.metrics, false);
    assert.equal('completedReviewRequestCount' in selected.summary.metrics, false);
  });

  test(`exact trusted ${fixture} rejects v2 and retains stale v1 fallback`, async () => {
    const selected = await selectSummary(
      node,
      [run(1), run(2)],
      source(new Map<number, unknown>([[1, oldSummary], [2, workloadSummary]]), fixture),
      async () => true,
    );

    assert.equal(selected.status, 'fallback');

    assert.equal(selected.stale, true);
    assert.equal(selected.source.runId, 1);
    assert.deepEqual(selected.summary, oldSummary);
  });
}

test('v2 bytes alone cannot admit a new Workflow generation', async () => {
  const selected = await selectSummary(
    node,
    [run(2)],
    source(new Map([[2, workloadSummary]]), './fixtures/reviewer-summary-station-11.yml'),
    async () => true,
  );

  assert.deepEqual(selected, { status: 'unavailable', stale: false });
});
