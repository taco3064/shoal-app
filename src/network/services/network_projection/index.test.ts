import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { allowedSummaryWorkflows } from '~app/protocol/services/network_compatibility';
import { stationReadiness } from '~app/protocol/services/station_readiness';
import { buildNetworkProjection, validateProjection } from './index';
import type { NetworkProjection, NetworkSource } from './index';

function fixture(): NetworkProjection {
  return JSON.parse(
    readFileSync(
      new URL(
        '../../../guide/services/directory/fixtures/network.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
}

test('projection preserves mixed generations and absence without padding', () => {
  const projection = fixture();
  const original = structuredClone(projection);

  validateProjection(projection);
  assert.deepEqual(projection, original);
  assert.equal(projection.schemaVersion, 1);
  assert.equal(projection.reviewers.length, 6);

  for (const reviewer of projection.reviewers) {
    const selected = reviewer.summary;

    if (selected.status === 'unavailable') {
      assert.equal('summary' in selected, false);
    } else {
      const hasWorkload = selected.summary.summarySchemaVersion === 2;

      assert.equal(
        'pendingReviewRequestCount' in selected.summary.metrics,
        hasWorkload,
      );

      assert.equal(
        'completedReviewRequestCount' in selected.summary.metrics,
        hasWorkload,
      );
    }
  }
});

for (const defect of [
  'action',
  'contract',
  'partition',
  'identity',
  'freshness',
]) {
  test('projection refuses invalid selected v2 ' + defect, () => {
    const projection = fixture();
    const selected = projection.reviewers[3].summary;

    assert.ok(selected.status !== 'unavailable');

    if (defect === 'action') {
      selected.source.actionCommit = 'a'.repeat(40);
    } else if (defect === 'contract') {
      selected.summary.summarySchemaVersion = 1;
    } else if (defect === 'partition') {
      assert.ok(selected.summary.summarySchemaVersion === 2);
      selected.summary.metrics.pendingReviewRequestCount += 1;
    } else if (defect === 'identity') {
      selected.summary.reviewerNode.repositoryId = 999;
    } else {
      selected.stale = true;
    }

    assert.throws(() => validateProjection(projection));
  });
}

test('unavailable cannot contain selected metrics or provenance', () => {
  const projection = fixture();

  Object.assign(projection.reviewers[2].summary, {
    summary: projection.reviewers[3].summary,
  });

  assert.throws(
    () => validateProjection(projection),
    /must not include metrics/,
  );
});

test('unavailable must retain the explicit non-stale absence state', () => {
  const projection = fixture();

  Object.assign(projection.reviewers[2].summary, { stale: true });
  assert.throws(() => validateProjection(projection), /must not be stale/);
});

test('shared readiness accepts official generations and rejects modified bytes', () => {
  for (const workflowDigest of allowedSummaryWorkflows.keys()) {
    assert.equal(
      stationReadiness({
        hasIssues: true,
        formDigest:
          '6f5dad1fd33ec1ea077eb30e866ef8dcf4d9d840239701b997781418da6c7f2c',
        workflowDigest,
      }).ready,
      true,
    );
  }

  assert.deepEqual(
    stationReadiness({
      hasIssues: true,
      formDigest:
        '6f5dad1fd33ec1ea077eb30e866ef8dcf4d9d840239701b997781418da6c7f2c',
      workflowDigest: '0'.repeat(64),
    }).reasons,
    ['summary_workflow_missing_or_unsupported'],
  );
});

test('complete mixed scan isolates Reviewer-level rejected evidence', async () => {
  const entries = fixture().reviewers;

  const nodes = entries.map((entry, index) => ({
    id: index === 0 ? 1379044983 : entry.repositoryId,
    full_name: entry.repository,
    html_url: entry.repositoryUrl,
    created_at: entry.joinedAt,
    default_branch: 'main',
    fork: index !== 0,
    has_issues: true,
    parent: { id: 1379044983 },
    owner: {
      login: entry.username,
      type: 'User',
      avatar_url: entry.avatarUrl,
      html_url: entry.profileUrl,
    },
  }));

  const workflow = (version: number) =>
    readFileSync(
      new URL(
        '../summary_selection/fixtures/reviewer-summary-station-'
        + version
        + '.yml',
        import.meta.url,
      ),
    );

  const form = readFileSync(
    new URL('./fixtures/review-request.yml', import.meta.url),
  );

  const source: NetworkSource = {
    async repository(name) {
      const node
        = name === 'taco3064/shoal-station'
          ? nodes[0]
          : nodes.find((entry) => entry.full_name === name);

      assert.ok(node);

      return node;
    },
    async pages<T>() {
      return nodes.slice(1) as T[];
    },
    async json<T>() {
      return { sha: 'a'.repeat(40) } as T;
    },
    async summaryRuns(name) {
      const node = nodes.find((entry) => entry.full_name === name);
      const entry = entries.find((reviewer) => reviewer.repository === name);

      assert.ok(node && entry);
      const ids = entry.summary.status === 'fallback' ? [1, 2] : [1];

      return ids.map((id) => ({
        id,
        path: '.github/workflows/reviewer-summary.yml',
        repository: { id: node.id },
        head_repository: { id: node.id },
        head_sha: 'a'.repeat(40),
        run_attempt: 1,
        run_started_at: '2026-10-0' + id + 'T00:00:00Z',
        status: 'completed',
        conclusion: 'success',
        html_url: entry.repositoryUrl + '/actions/runs/' + id,
      }));
    },
    async committedBytes(name, path) {
      const entry = entries.find((reviewer) => reviewer.repository === name);

      assert.ok(entry);

      return path.includes('ISSUE_TEMPLATE')
        ? form
        : workflow(
            entry.summary.status !== 'unavailable'
            && entry.summary.summary.summarySchemaVersion === 2
              ? 13
              : 11,
          );
    },
    async runAttempt() {
      throw new Error('Single-attempt fixture');
    },
    async publicSummary(name, repositoryId, id) {
      const entry = entries.find((reviewer) => reviewer.repository === name);

      assert.ok(entry);

      if (entry.summary.status === 'unavailable' || id === 2) {
        return {
          bytes: Buffer.from('{}'),
          url: 'https://example.test/rejected',
        };
      }

      const summary = structuredClone(entry.summary.summary);

      summary.reviewerNode.repositoryId = repositoryId;

      return {
        bytes: Buffer.from(JSON.stringify(summary)),
        url:
          'https://raw.githubusercontent.com/'
          + name
          + '/shoal-summary-'
          + repositoryId
          + '-'
          + id
          + '-1/reviewer-summary.json',
      };
    },
  };

  const projection = await buildNetworkProjection(
    source,
    '2026-10-04T00:00:00Z',
    async () => true,
  );

  assert.equal(projection.reviewers.length, 6);

  for (const expected of entries) {
    const actual = projection.reviewers.find(
      (entry) => entry.username === expected.username,
    );

    assert.ok(actual);
    assert.equal(actual.summary.status, expected.summary.status);

    if (
      actual.summary.status !== 'unavailable'
      && expected.summary.status !== 'unavailable'
    ) {
      assert.deepEqual(
        actual.summary.summary.metrics,
        expected.summary.summary.metrics,
      );
    }
  }

  validateProjection(projection);
});
