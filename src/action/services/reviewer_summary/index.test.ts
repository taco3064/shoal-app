import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeReviewerSummary } from './index';
import {
  admitted,
  changedCommit,
  comment,
  input,
  issue,
  judgment,
  requester,
  trigger,
} from './fixtures/workload';
import type { SummaryInput } from './types';

async function expectMetrics(
  candidate: SummaryInput,
  expected: [number, number, number, number, number, number],
): Promise<void> {
  const summary = await computeReviewerSummary(candidate);
  const metrics = summary.metrics;

  assert.equal(summary.protocolVersion, 1);
  assert.equal(summary.summarySchemaVersion, 2);

  assert.deepEqual([
    metrics.validReviewRequestIssueCount,
    metrics.reReviewRequestIssueCount,
    metrics.reviewBackedStarCount,
    metrics.invalidReviewCommentCount,
    metrics.pendingReviewRequestCount,
    metrics.completedReviewRequestCount,
  ], expected);

  assert.equal(metrics.pendingReviewRequestCount + metrics.completedReviewRequestCount,
    metrics.validReviewRequestIssueCount);

  assert.ok(metrics.reReviewRequestIssueCount <= metrics.validReviewRequestIssueCount);

  assert.ok(metrics.reviewBackedStarCount
    <= metrics.validReviewRequestIssueCount - metrics.reReviewRequestIssueCount);
}

test('admitted Initial work remains pending when open or closed', async () => {
  for (const state of ['open', 'closed'] as const) {
    await expectMetrics(input([admitted([], { state })]), [1, 0, 0, 0, 1, 0]);
  }
});

test('Initial PASS and FAIL complete work; only current PASS backs a Star', async () => {
  for (const verdict of ['PASS', 'FAIL']) {
    const initial = judgment(2, { actualStarState: verdict === 'PASS', verdict });

    await expectMetrics(input([admitted([initial])]),
      [1, 0, verdict === 'PASS' ? 1 : 0, 0, 0, 1]);
  }
});

test('valid manual Initial evidence completes work without admission', async () => {
  await expectMetrics(input([issue(1, [judgment(2)])]), [1, 0, 1, 0, 0, 1]);
});

test('a request without admission or usable manual evidence is unprovable', async () => {
  await expectMetrics(input([issue(1)]), [0, 0, 0, 0, 0, 0]);
});

test('malformed Initial stays pending; I follows closed-thread rules', async () => {
  for (const state of ['open', 'closed'] as const) {
    const malformed = judgment(2, { targetCommit: 'invalid' });

    await expectMetrics(input([admitted([malformed], { state })]),
      [1, 0, 0, state === 'closed' ? 1 : 0, 1, 0]);
  }
});

test('an accepted terminal trigger leaves completed Initial work completed', async () => {
  await expectMetrics(input([admitted([judgment(2), trigger(3, 2)]), issue(2)]),
    [2, 1, 1, 0, 1, 1]);
});

test('a usable result completes every distinct trigger in its epoch', async () => {
  for (const type of ['RE_REVIEWED', 'STAR_REVOKED', 'REVOKED_EXTERNALLY']) {
    const pass = type === 'RE_REVIEWED';

    const comments = [
      judgment(2), trigger(3, 2), trigger(4, 3, {
        eligibilityTargetCommit: 'd'.repeat(40),
      }), judgment(5, {
        actualStarState: pass, type, verdict: pass ? 'PASS' : 'FAIL',
      }),
    ];

    await expectMetrics(input([admitted(comments), issue(2), issue(3)]),
      [3, 2, pass ? 1 : 0, 0, 0, 3]);
  }
});

test('a later epoch stays pending after an earlier epoch completes', async () => {
  const comments = [judgment(2), trigger(3, 2), judgment(4, { type: 'RE_REVIEWED' }),
    trigger(5, 3)];

  await expectMetrics(input([admitted(comments), issue(2), issue(3)]),
    [3, 2, 1, 0, 1, 2]);
});

test('closed terminal epoch completes only when both basis commits match', async () => {
  for (const drift of ['none', 'target', 'policy']) {
    const candidate = input([admitted([judgment(2), trigger(3, 2)], { state: 'closed' }),
      issue(2)]);

    if (drift === 'target') {
      const resolve = candidate.resolvers.resolveTargetRepository;

      candidate.resolvers.resolveTargetRepository = async (owner, name) => {
        const target = await resolve(owner, name);

        return target && { ...target, currentDefaultBranchHead: changedCommit };
      };
    }

    if (drift === 'policy') {
      candidate.resolvers.resolveCurrentReviewPolicyCommit = async () => changedCommit;
    }

    await expectMetrics(candidate,
      [2, 1, drift === 'none' ? 1 : 0, 0, drift === 'none' ? 0 : 1,
        drift === 'none' ? 2 : 1]);
  }
});

test('open terminal epoch stays pending even when its basis converges', async () => {
  await expectMetrics(input([admitted([judgment(2), trigger(3, 2)]), issue(2)]),
    [2, 1, 1, 0, 1, 1]);
});

test('a closed epoch requires a usable previous judgment to complete', async () => {
  const comments = [judgment(2, { targetCommit: 'invalid' }), trigger(3, 2)];

  await expectMetrics(input([admitted(comments, { state: 'closed' }), issue(2)]),
    [2, 1, 0, 1, 2, 0]);
});

test('later evidence does not invent historical no-new-basis completion', async () => {
  const comments = [judgment(2), trigger(3, 2), trigger(4, 3)];
  const candidate = input([admitted(comments), issue(2), issue(3)]);

  await expectMetrics(candidate, [3, 2, 1, 0, 2, 1]);
  candidate.issues[0].state = 'closed';
  await expectMetrics(candidate, [3, 2, 1, 0, 0, 3]);
});

test('chronology rather than resolver input order decides completion', async () => {
  const comments = [trigger(5, 3), judgment(4, { type: 'RE_REVIEWED' }), trigger(3, 2),
    judgment(2)];

  await expectMetrics(input([issue(3), issue(2), admitted(comments)]),
    [3, 2, 1, 0, 1, 2]);
});

test('same timestamp uses numeric comment ID, independently of input order', async () => {
  const sameTime = '2026-01-01T01:00:00Z';
  const requested = { ...trigger(10, 2), createdAt: sameTime };
  const completed = { ...judgment(11, { type: 'RE_REVIEWED' }), createdAt: sameTime };

  await expectMetrics(input([admitted([completed, requested, judgment(2)]), issue(2)]),
    [2, 1, 1, 0, 0, 2]);

  await expectMetrics(input([admitted([
    { ...requested, id: 11 }, { ...completed, id: 10 }, judgment(2),
  ]), issue(2)]), [2, 1, 1, 0, 1, 1]);
});

test('invalid later results never close an epoch', async () => {
  const unusable = [judgment(4, { type: 'REVIEWED' }),
    judgment(5, { type: 'RE_REVIEWED', targetCommit: 'broken' }),
    { ...judgment(6, { type: 'RE_REVIEWED' }), author: requester },
    judgment(7, { type: 'RE_REVIEWED', reviewerNodeId: 999 }),
    judgment(8, { type: 'RE_REVIEWED', targetRepositoryId: 999 })];

  const candidate = input([
    admitted([judgment(2), trigger(3, 2), ...unusable], { state: 'closed' }), issue(2),
  ]);

  candidate.resolvers.resolveCurrentReviewPolicyCommit = async () => changedCommit;
  await expectMetrics(candidate, [2, 1, 0, 5, 1, 1]);
});

test('forged, wrong identity, and pre-Initial events create no workload', async () => {
  const comments = [trigger(2, 2), judgment(3),
    { ...trigger(4, 3), author: requester }, trigger(5, 4, { reviewerNodeId: 999 }),
    trigger(6, 5, { targetRepositoryId: 999 })];

  await expectMetrics(input([admitted(comments), issue(2), issue(3), issue(4), issue(5)]),
    [1, 0, 1, 0, 0, 1]);
});

test('unaccepted duplicates and arbitrary Issues create no workload', async () => {
  await expectMetrics(input([admitted([judgment(2)]), issue(2),
    issue(3, [], { body: 'INVALID_REQUEST' }),
    issue(4, [], { body: 'General discussion' }),
  ]),
  [1, 0, 1, 0, 0, 1]);
});

test('repeated evidence for one trigger does not duplicate R/Q/P/C', async () => {
  await expectMetrics(input([
    admitted([judgment(2), trigger(3, 2), trigger(4, 2)]), issue(2),
  ]),
  [2, 1, 1, 0, 1, 1]);
});

test('malformed current Requests drop out while valid history survives', async () => {
  const comments = [judgment(2), trigger(3, 2), judgment(4, { type: 'RE_REVIEWED' })];

  await expectMetrics(input([
    admitted(comments, { body: 'edited invalid request' }), issue(2),
  ]),
  [1, 1, 0, 0, 0, 1]);

  await expectMetrics(input([admitted(comments), issue(2, [], { body: 'invalid' })]),
    [1, 0, 1, 0, 0, 1]);
});

test('invalid Membership or Target identity removes affected work', async () => {
  for (const invalid of ['membership', 'target']) {
    const candidate = input([admitted([judgment(2), trigger(3, 2)]), issue(2)]);

    if (invalid === 'membership') {
      candidate.resolvers.resolveRequesterNode = async () => null;
    } else {
      candidate.resolvers.resolveTargetRepository = async () => null;
    }

    await expectMetrics(candidate, [0, 0, 0, 0, 0, 0]);
  }
});

test('recognizable broken Initial retains boundary but stays pending', async () => {
  const comments = [judgment(2, { targetCommit: 'broken' }), trigger(3, 2),
    judgment(4, { type: 'RE_REVIEWED' })];

  await expectMetrics(input([admitted(comments), issue(2)]), [2, 1, 1, 0, 1, 1]);
});

test('illegal first Re-review cannot legitimize later evidence', async () => {
  const comments = [judgment(2, { type: 'RE_REVIEWED' }), trigger(3, 2),
    judgment(4, { type: 'RE_REVIEWED' })];

  await expectMetrics(input([admitted(comments, { state: 'closed' }), issue(2)]),
    [1, 0, 0, 2, 1, 0]);
});

test('non-request lifecycle adds no workload; Star drift changes only S', async () => {
  const comments = [judgment(2), trigger(3, 2, { type: 'STALE_DETECTED' }),
    trigger(4, 3, { type: 'ENDORSEMENT_DRIFT' }),
    comment(5, { note: 'ordinary comment' })];

  const candidate = input([admitted(comments), issue(2), issue(3)]);
  const resolve = candidate.resolvers.resolveTargetRepository;

  candidate.resolvers.resolveTargetRepository = async (owner, name) => {
    const target = await resolve(owner, name);

    return target && { ...target, isStarredByReviewer: false };
  };

  await expectMetrics(candidate, [1, 0, 0, 0, 0, 1]);
});

test('same observable state produces deterministic output', async () => {
  const candidate = input([admitted([judgment(2), trigger(3, 2)]), issue(2)]);

  assert.deepEqual(
    await computeReviewerSummary(candidate), await computeReviewerSummary(candidate),
  );
});

test('manual history with broken Initial keeps Initial pending', async () => {
  const comments = [judgment(2, { targetCommit: 'broken' }),
    judgment(3, { type: 'RE_REVIEWED' })];

  await expectMetrics(input([issue(1, comments)]), [1, 0, 1, 0, 1, 0]);
});

test('Root-owner Membership contributes workload without fork facts', async () => {
  const candidate = input([admitted([judgment(2), trigger(3, 2)]), issue(2)]);

  candidate.resolvers.resolveRequesterNode = async () => ({
    id: 10,
    isFork: false,
    owner: requester,
    parentRepositoryId: null,
  });

  await expectMetrics(candidate, [2, 1, 1, 0, 1, 1]);
});

test('unproven automation cannot create accepted trigger workload', async () => {
  const automated = {
    ...trigger(3, 2),
    author: { id: 40, login: 'github-actions[bot]', type: 'Bot' },
    performedViaGitHubApp: { slug: 'github-actions' },
  };

  await expectMetrics(input([admitted([judgment(2), automated]), issue(2)]),
    [1, 0, 1, 0, 0, 1]);
});

test('broken Initial prevents a later REVIEWED replacing Initial', async () => {
  const comments = [judgment(2, { targetCommit: 'broken' }), judgment(3)];

  await expectMetrics(input([admitted(comments, { state: 'closed' })]),
    [1, 0, 0, 2, 1, 0]);
});
