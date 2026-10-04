import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  allowedSummaryWorkflows,
  currentReviewerSummaryContract,
  legacyReviewerSummaryContract,
} from '../network_compatibility';
import {
  createReviewerSummary,
  stringifyReviewerSummary,
  validateReviewerSummary,
} from './index';

const legacyMetrics = {
  invalidReviewCommentCount: 1,
  reReviewRequestIssueCount: 2,
  reviewBackedStarCount: 1,
  validReviewRequestIssueCount: 4,
};

const currentMetrics = {
  ...legacyMetrics,
  pendingReviewRequestCount: 1,
  completedReviewRequestCount: 3,
};

const legacy = {
  protocolVersion: 1,
  summarySchemaVersion: 1,
  reviewerNode: { repositoryId: 123 },
  metrics: legacyMetrics,
};

function legacyValidation(metrics: Record<string, unknown>) {
  return () => validateReviewerSummary(
    { ...legacy, metrics },
    legacyReviewerSummaryContract,
  );
}

function currentValidation(metrics: Record<string, unknown>) {
  return () => validateReviewerSummary({ ...legacy, summarySchemaVersion: 2, metrics });
}

test('source emits deterministic Protocol 1 / Summary 2', () => {
  const summary = createReviewerSummary(123, currentMetrics);

  assert.equal(summary.protocolVersion, 1);
  assert.equal(summary.summarySchemaVersion, 2);
  assert.deepEqual(summary.metrics, currentMetrics);
  assert.deepEqual(JSON.parse(stringifyReviewerSummary(summary)), summary);
  assert.equal(stringifyReviewerSummary(summary), stringifyReviewerSummary(summary));
});

test('v1 parsing preserves four metrics without fabricated workload', () => {
  const parsed = validateReviewerSummary(legacy, legacyReviewerSummaryContract);

  assert.deepEqual(parsed, legacy);
  assert.equal('pendingReviewRequestCount' in parsed.metrics, false);
  assert.equal('completedReviewRequestCount' in parsed.metrics, false);
  assert.equal(parsed.summarySchemaVersion, 1);
});

test('existing presentation fixtures retain v1 metrics', () => {
  const projection = JSON.parse(readFileSync(
    new URL('../../../guide/services/directory/fixtures/network.json', import.meta.url),
    'utf8',
  ));

  let checked = 0;

  for (const entry of projection.reviewers) {
    if (entry.summary.status === 'unavailable') {
      continue;
    }

    if (entry.summary.summary.summarySchemaVersion !== 1) {
      continue;
    }

    assert.deepEqual(
      validateReviewerSummary(entry.summary.summary, legacyReviewerSummaryContract),
      entry.summary.summary,
    );

    checked += 1;
  }

  assert.ok(checked > 0, 'Fixture must exercise at least one v1 Summary.');
});

test('existing Workflow bindings remain 1/1 while source advances to 1/2', () => {
  assert.deepEqual(currentReviewerSummaryContract, {
    protocolVersion: 1,
    summarySchemaVersion: 2,
  });

  const legacyDigests = [
    '3b66f6c4afb545bbf1ad847aed96d0dd8c336e6df100c6b898250a0bddf58fd6',
    '616eea6f7ce06c0991f0023768c02c79a99d53aeb2f845c0934461720546a999',
    'd586ab618c894d9729e21d7105becb0ca805df576198353293b1f77818927e99',
    '70d1011d0b1a6a68677bc891a408f2b73af868a89d283bffdfefa2fd24a6b9d2',
  ];

  for (const digest of legacyDigests) {
    const binding = allowedSummaryWorkflows.get(digest);

    assert.ok(binding);

    assert.deepEqual(binding.reviewerSummary, {
      protocolVersion: 1,
      summarySchemaVersion: 1,
    });
  }
});

test('candidate declarations cannot widen or select the trusted parser', () => {
  const current = createReviewerSummary(123, currentMetrics);

  assert.throws(() => validateReviewerSummary(legacy), /does not match trusted workflow/);
  assert.throws(() => validateReviewerSummary(current, legacyReviewerSummaryContract), /does not match/);
  assert.throws(() => validateReviewerSummary({ ...current, protocolVersion: 2 }), /does not match/);
  assert.throws(() => validateReviewerSummary({ ...current, summarySchemaVersion: 3 }), /does not match/);

  assert.throws(() => validateReviewerSummary(current, {
    protocolVersion: 1,
    summarySchemaVersion: 3,
  }), /unsupported/);
});

test('each schema rejects missing or additional primitive fields', () => {
  for (const key of Object.keys(currentMetrics)) {
    const missing: Record<string, unknown> = { ...currentMetrics };

    delete missing[key];
    assert.throws(currentValidation(missing), /exactly/);
  }

  for (const key of Object.keys(legacyMetrics)) {
    const missing: Record<string, unknown> = { ...legacyMetrics };

    delete missing[key];
    assert.throws(legacyValidation(missing), /exactly/);
  }

  assert.throws(currentValidation({ ...currentMetrics, score: 100 }), /exactly/);
  assert.throws(legacyValidation(currentMetrics), /exactly/);
  assert.throws(currentValidation(legacyMetrics), /exactly/);
});

test('workload values must be nonnegative integers and partition R', () => {
  for (const field of ['pendingReviewRequestCount', 'completedReviewRequestCount']) {
    for (const invalid of [-1, 0.5, NaN, Infinity, '1', null, undefined]) {
      assert.throws(currentValidation({ ...currentMetrics, [field]: invalid }), /non-negative integer/);
    }
  }

  assert.throws(currentValidation({ ...currentMetrics, completedReviewRequestCount: 2 }), /must equal/);

  assert.deepEqual(createReviewerSummary(123, {
    invalidReviewCommentCount: 0,
    reReviewRequestIssueCount: 0,
    reviewBackedStarCount: 0,
    validReviewRequestIssueCount: 0,
    pendingReviewRequestCount: 0,
    completedReviewRequestCount: 0,
  }).metrics.pendingReviewRequestCount, 0);
});

test('both generations enforce Q <= R and S <= R - Q', () => {
  assert.throws(legacyValidation({ ...legacyMetrics, reReviewRequestIssueCount: 5 }), /must not exceed/);
  assert.throws(legacyValidation({ ...legacyMetrics, reviewBackedStarCount: 3 }), /must not exceed/);
  assert.throws(currentValidation({ ...currentMetrics, reReviewRequestIssueCount: 5 }), /must not exceed/);
  assert.throws(currentValidation({ ...currentMetrics, reviewBackedStarCount: 3 }), /must not exceed/);
});
