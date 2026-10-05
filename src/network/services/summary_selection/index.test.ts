import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  allowedSummaryWorkflows,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';
import { stationReadiness } from '~app/protocol/services/station_readiness';
import { createReviewerSummary } from '~app/protocol/services/reviewer_summary_schema';
import type { GitHubRepository, WorkflowRun } from '../github_api';
import { hash, selectSummary } from './index';
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

function source(
  summaries: Map<number, unknown>,
  fixture: string,
): SummarySource {
  const workflowBytes = readFileSync(new URL(fixture, import.meta.url));

  return {
    async runAttempt() {
      throw new Error(
        'Single-attempt fixture must not enumerate other attempts.',
      );
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

    assert.equal(
      'pendingReviewRequestCount' in selected.summary.metrics,
      false,
    );

    assert.equal(
      'completedReviewRequestCount' in selected.summary.metrics,
      false,
    );
  });

  test(`exact trusted ${fixture} rejects v2 and retains stale v1 fallback`, async () => {
    const selected = await selectSummary(
      node,
      [run(1), run(2)],
      source(
        new Map<number, unknown>([
          [1, oldSummary],
          [2, workloadSummary],
        ]),
        fixture,
      ),
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
    source(
      new Map([[2, workloadSummary]]),
      './fixtures/reviewer-summary-station-11.yml',
    ),
    async () => true,
  );

  assert.deepEqual(selected, { status: 'unavailable', stale: false });
});

for (const [workloadFixture, expectedDigest] of [
  [
    './fixtures/reviewer-summary-station-13.yml',
    'f6cda44c7e6e12117dac3c1f1c145bb69283eb3cfe66690ba67adddd3b4e89bd',
  ],
  [
    // Exact bytes from shoal-station c0272358f11d67227567e02cd1c5282f487a9437.
    './fixtures/reviewer-summary-station-17.yml',
    'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
  ],
]) {
  const workloadWorkflow = readFileSync(
    new URL(workloadFixture, import.meta.url),
  );

  test(`${workloadFixture} binds exact bytes to the accepted Action and contract 1/2`, () => {
    assert.equal(
      hash(workloadWorkflow),
      expectedDigest,
    );

    assert.match(
      workloadWorkflow.toString(),
      /uses: taco3064\/shoal-action@4918e1afe85f15f8fe263eaf2866cd02a1f70a62/,
    );

    assert.deepEqual(allowedSummaryWorkflows.get(hash(workloadWorkflow)), {
      actionCommit: '4918e1afe85f15f8fe263eaf2866cd02a1f70a62',
      reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 2 },
    });

    assert.equal(allowedSummaryWorkflows.size, 6);

    for (const [digest, trust] of allowedSummaryWorkflows) {
      if (
        ![
          'f6cda44c7e6e12117dac3c1f1c145bb69283eb3cfe66690ba67adddd3b4e89bd',
          'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
        ].includes(digest)
      ) {
        assert.deepEqual(trust.reviewerSummary, {
          protocolVersion: 1,
          summarySchemaVersion: 1,
        });
      }
    }
  });

  test('v2 selects current exact P/C and provenance', async () => {
    const selected = await selectSummary(
      node,
      [run(2)],
      source(new Map([[2, workloadSummary]]), workloadFixture),
      async () => true,
    );

    assert.equal(selected.status, 'current');
    assert.deepEqual(selected.summary, workloadSummary);
    assert.equal(selected.source.workflowDigest, hash(workloadWorkflow));

    assert.equal(
      selected.source.actionCommit,
      '4918e1afe85f15f8fe263eaf2866cd02a1f70a62',
    );

    assert.equal(selected.source.runId, 2);
  });

  for (const [label, invalid] of [
    ['unsupported Protocol', { ...workloadSummary, protocolVersion: 2 }],
    ['unsupported schema', { ...workloadSummary, summarySchemaVersion: 3 }],
    ['v1 under the v2 binding', oldSummary],
    [
      'broken workload invariant',
      {
        ...workloadSummary,
        metrics: { ...workloadSummary.metrics, pendingReviewRequestCount: 100 },
      },
    ],
    [
      'wrong Reviewer Repository ID',
      { ...workloadSummary, reviewerNode: { repositoryId: 999 } },
    ],
    ['missing workload', { ...workloadSummary, metrics: oldSummary.metrics }],
  ]) {
    test(`rejected ${label} retains prior v2 fallback without contamination`, async () => {
      const selected = await selectSummary(
        node,
        [run(1), run(2)],
        source(
          new Map<number, unknown>([
            [1, workloadSummary],
            [2, invalid],
          ]),
          workloadFixture,
        ),
        async () => true,
      );

      assert.equal(selected.status, 'fallback');
      assert.equal(selected.stale, true);
      assert.equal(selected.source.runId, 1);
      assert.deepEqual(selected.summary, workloadSummary);
    });
  }

  test('rejected newer v2 retains independent v1 fallback', async () => {
    const oldRun = { ...run(1), head_sha: 'b'.repeat(40) };

    const mixed = source(
      new Map<number, unknown>([
        [1, oldSummary],
        [
          2,
          {
            ...workloadSummary,
            metrics: {
              ...workloadSummary.metrics,
              completedReviewRequestCount: 100,
            },
          },
        ],
      ]),
      workloadFixture,
    );

    mixed.committedBytes = async (_name, _path, ref) =>
      ref === oldRun.head_sha
        ? readFileSync(
            new URL(
              './fixtures/reviewer-summary-station-11.yml',
              import.meta.url,
            ),
          )
        : workloadWorkflow;

    const selected = await selectSummary(
      node,
      [oldRun, run(2)],
      mixed,
      async () => true,
    );

    assert.equal(selected.status, 'fallback');
    assert.deepEqual(selected.summary, oldSummary);
    assert.equal(selected.source.runId, 1);
    assert.equal(selected.source.workflowCommit, oldRun.head_sha);

    assert.equal(
      selected.source.actionCommit,
      'e1824eaa4766891a6fe56bb1ea2dfb3f13541e73',
    );

    assert.equal('pendingReviewRequestCount' in selected.summary.metrics, false);
  });

  for (const [label, bytes] of [
    [
      'byte-different equivalent workflow',
      Buffer.concat([workloadWorkflow, Buffer.from('\n')]),
    ],
    [
      'wrong immutable Action pin',
      Buffer.from(
        workloadWorkflow
          .toString()
          .replace('4918e1afe85f15f8fe263eaf2866cd02a1f70a62', 'a'.repeat(40)),
      ),
    ],
  ]) {
    test(`${label} is rejected before transport and attestation`, async () => {
      const modified = source(new Map([[2, workloadSummary]]), workloadFixture);

      modified.committedBytes = async () => Buffer.from(bytes);

      modified.publicSummary = async () => {
        throw new Error('Untrusted workflow must stop here.');
      };

      const selected = await selectSummary(node, [run(2)], modified, async () => {
        throw new Error('Untrusted workflow must not verify.');
      });

      assert.deepEqual(selected, { status: 'unavailable', stale: false });

      assert.deepEqual(stationReadiness({
        hasIssues: true,
        formDigest: '6f5dad1fd33ec1ea077eb30e866ef8dcf4d9d840239701b997781418da6c7f2c',
        workflowDigest: hash(Buffer.from(bytes)),
      }), { ready: false, reasons: ['summary_workflow_missing_or_unsupported'] });
    });
  }

  for (const rejection of [
    'attestation',
    'transport',
    'head-repository',
    'failed-execution',
  ]) {
    test(`v2 still requires ${rejection} trust-envelope predicate`, async () => {
      const candidate = run(2);
      const input = source(new Map([[2, workloadSummary]]), workloadFixture);

      if (rejection === 'transport') {
        input.publicSummary = async () => null;
      }

      if (rejection === 'head-repository') {
        candidate.head_repository = { id: 999 };
      }

      if (rejection === 'failed-execution') {
        candidate.conclusion = 'failure';
      }

      const selected = await selectSummary(
        node,
        [candidate],
        input,
        async () => rejection !== 'attestation',
      );

      assert.deepEqual(selected, { status: 'unavailable', stale: false });
    });
  }
}

test('all accepted callers remain base-ready without auxiliary Hosted inspection', () => {
  for (const workflowDigest of allowedSummaryWorkflows.keys()) {
    assert.deepEqual(stationReadiness({
      hasIssues: true,
      formDigest: '6f5dad1fd33ec1ea077eb30e866ef8dcf4d9d840239701b997781418da6c7f2c',
      workflowDigest,
    }), { ready: true, reasons: [] });
  }
});
