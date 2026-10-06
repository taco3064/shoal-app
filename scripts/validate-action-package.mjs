import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';

register('../dist/action-package/loader.mjs', import.meta.url);
const { runReviewerSummaryAction } = await import('../dist/action-package/src/action/index.js');

const { renderEvidenceComment } = await import('../dist/action-package/src/protocol/services/review_protocol/index.js');
const evidence = (record) => renderEvidenceComment(record, { requestAuthor: 'requester', explanation: 'Policy checked.' });

const author = { id: 10, login: 'requester', type: 'User' };
const reviewer = { id: 20, login: 'reviewer', type: 'User' };
const rootId = 100;
const reviewerId = 200;
const targetId = 300;
const targetCommit = 'a'.repeat(40);
const policyCommit = 'b'.repeat(40);

function repository(overrides = {}) {
  return {
    id: rootId,
    owner: author,
    full_name: 'requester/station',
    name: 'station',
    default_branch: 'main',
    fork: false,
    ...overrides,
  };
}

const comments = [
  {
    id: 1,
    body: evidence({
      reviewerNodeId: reviewerId, targetRepositoryId: targetId, repositoryName: 'target',
    }),
  },
  {
    id: 2,
    body: evidence({
      type: 'REVIEWED',
      reviewerNodeId: reviewerId,
      targetRepositoryId: targetId,
      targetRepositoryFullName: 'requester/target',
      targetDefaultBranch: 'main',
      targetCommit,
      reviewPolicyPath: 'README.md',
      reviewPolicyCommit: policyCommit,
      verdict: 'PASS',
      actualStarState: true,
      reviewedAt: '2026-10-01T00:00:00Z',
    }),
  },
].map((comment) => ({
  ...comment, user: reviewer, created_at: '2026-10-01T00:00:00Z',
}));

async function run(candidate, threadComments = comments, state = 'closed', triggers = []) {
  const routes = {
    '/repos/reviewer/station': repository({ id: reviewerId, owner: reviewer, full_name: 'reviewer/station' }),
    '/repos/reviewer/station/issues': [{
      number: 1, state, user: author,
      body: '### Repository name\n\ntarget\n\n### Invitation message\n\n_No response_',
    }, ...triggers],
    '/repos/reviewer/station/issues/1/comments': threadComments,
    '/repos/reviewer/station/commits': [{ sha: policyCommit }],
    '/repos/requester/station': candidate,
    '/users/requester/repos': [],
    '/repos/requester/target': repository({ id: targetId, name: 'target', full_name: 'requester/target' }),
    '/repos/requester/target/branches/main': { commit: { sha: targetCommit } },
    '/users/reviewer/starred': [repository({ id: targetId })],
  };

  for (const trigger of triggers) {
    routes[`/repos/reviewer/station/issues/${trigger.number}/comments`] = [];
  }

  const result = await runReviewerSummaryAction({
    networkRootRepositoryId: rootId,
    networkRootRepositoryName: 'station',
    reviewerNodeRepository: 'reviewer/station',
    fetch: async (url, options) => {
      // The runtime's fetch contract exposes headers only: no mutation method or body.
      assert.deepEqual(Object.keys(options).sort(), ['headers']);
      const path = new URL(url).pathname;

      assert.ok(path in routes, `Unexpected GitHub read: ${path}`);
      return new Response(JSON.stringify(routes[path]));
    },
  });

  assert.equal(result.filename, 'reviewer-summary.json');
  assert.deepEqual(JSON.parse(result.text), result.json);
  assert.equal(result.json.protocolVersion, 1);
  assert.equal(result.json.summarySchemaVersion, 2);
  assert.equal(result.json.metrics.pendingReviewRequestCount
    + result.json.metrics.completedReviewRequestCount,
  result.json.metrics.validReviewRequestIssueCount);
  return result.json;
}

const root = await run(repository());
const fork = await run(repository({ id: 400, fork: true, parent: { id: rootId } }));

assert.deepEqual(root, fork);
assert.deepEqual(root.metrics, {
  pendingReviewRequestCount: 0,
  completedReviewRequestCount: 1,
  invalidReviewCommentCount: 0,
  reReviewRequestIssueCount: 0,
  reviewBackedStarCount: 1,
  validReviewRequestIssueCount: 1,
});

for (const overrides of [
  { owner: { ...author, type: 'Organization' } },
  { id: 400, fork: true, parent: { id: rootId }, owner: { ...author, type: 'Organization' } },
  { owner: { ...author, id: 99 } },
  { id: 400, fork: true, parent: { id: rootId }, owner: { ...author, id: 99 } },
  { id: 400, fork: true, parent: { id: 999 }, source: { id: rootId } },
  { id: 400, fork: true, parent: { id: 999 } },
  { id: 400 },
]) {
  const rejected = await run(repository(overrides));

  assert.equal(rejected.metrics.validReviewRequestIssueCount, 0);
  assert.equal(rejected.metrics.reviewBackedStarCount, 0);
  assert.equal(rejected.metrics.pendingReviewRequestCount, 0);
  assert.equal(rejected.metrics.completedReviewRequestCount, 0);
}

const pending = await run(repository(), [comments[0]], 'open');
assert.equal(pending.metrics.pendingReviewRequestCount, 1);
assert.equal(pending.metrics.completedReviewRequestCount, 0);
const lifecycle = {
  id: 3, user: reviewer, created_at: '2026-10-01T01:00:00Z',
  body: evidence({
    type: 'RE_REVIEW_REQUESTED', reviewerNodeId: reviewerId,
    targetRepositoryId: targetId, requestIssueNumber: 2,
    eligibilityTargetCommit: 'c'.repeat(40), reviewPolicyCommit: policyCommit,
    reason: 'TARGET_CHANGED',
  }),
};
const trigger = {
  number: 2, state: 'closed', user: author,
  body: '### Repository name\n\ntarget\n\n### Invitation message\n\n_No response_',
};
const openEpoch = await run(repository(), [...comments, lifecycle], 'open', [trigger]);
assert.equal(openEpoch.metrics.pendingReviewRequestCount, 1);
assert.equal(openEpoch.metrics.completedReviewRequestCount, 1);
const closedEpoch = await run(repository(), [...comments, lifecycle], 'closed', [trigger]);
assert.equal(closedEpoch.metrics.pendingReviewRequestCount, 0);
assert.equal(closedEpoch.metrics.completedReviewRequestCount, 2);

// The same new envelope establishes Manual Review only under Reviewer authorship.
assert.deepEqual((await run(repository(), [comments[1]])).metrics, root.metrics);
const { decodeEvidenceDocument } = await import('../dist/action-package/src/protocol/services/review_protocol/index.js');
const formal = decodeEvidenceDocument(comments[1].body).document.record;
const judgmentComment = (record, overrides = {}) => ({ ...comments[1], body: evidence(record), ...overrides });
const failed = await run(repository(), [comments[0], judgmentComment({ ...formal, verdict: 'FAIL', actualStarState: false })]);
assert.equal(failed.metrics.completedReviewRequestCount, 1);
assert.equal(failed.metrics.reviewBackedStarCount, 0);
assert.equal(failed.metrics.invalidReviewCommentCount, 0);
const wrongAuthor = await run(repository(), [comments[0], judgmentComment(formal, { user: author })]);
assert.equal(wrongAuthor.metrics.completedReviewRequestCount, 0);
assert.equal(wrongAuthor.metrics.invalidReviewCommentCount, 1);
const stale = await run(repository(), [comments[0], judgmentComment({ ...formal, targetCommit: 'd'.repeat(40) })]);
assert.equal(stale.metrics.reviewBackedStarCount, 0);
for (const body of ['Review Result: PASS', 'REVIEWED', JSON.stringify(formal),
  'shoal-review-event:v1\n' + JSON.stringify(formal), '<summary>Formal Shoal evidence</summary>']) {
  const result = await run(repository(), [comments[0], { ...comments[1], body }], 'open');
  assert.deepEqual(result.metrics, pending.metrics);
}
const malformedRecord = await run(repository(), [comments[0], judgmentComment({ ...formal, targetCommit: 'short' })]);
assert.equal(malformedRecord.metrics.invalidReviewCommentCount, 1);
assert.equal(malformedRecord.metrics.completedReviewRequestCount, 0);
for (const body of [comments[1].body + comments[1].body,
  comments[1].body.replace('<!-- shoal-evidence:v1:end -->', ''),
  comments[1].body.replace('"formatVersion":1', '"formatVersion":99'),
  comments[1].body.replaceAll('shoal-evidence:v1:', 'shoal-evidence:v99:'),
  comments[1].body.replace('"verdict":"PASS"', '"verdict":"FAIL","verdict":"PASS"'),
  comments[1].body.replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1'),
]) {
  const invalid = { ...comments[1], body };
  const result = await run(repository(), [comments[0], invalid]);
  assert.equal(result.metrics.invalidReviewCommentCount, 1);
  assert.equal(result.metrics.completedReviewRequestCount, 0);
  assert.equal(result.metrics.pendingReviewRequestCount, 1);
  assert.equal(result.metrics.reviewBackedStarCount, 0);
  assert.equal(result.metrics.validReviewRequestIssueCount, 1);
  assert.equal(result.metrics.reReviewRequestIssueCount, 0);
  assert.equal((await run(repository(), [comments[0], invalid], 'open')).metrics.invalidReviewCommentCount, 0);
  assert.equal((await run(repository(), [invalid])).metrics.validReviewRequestIssueCount, 0);
}
const damagedMachine = '<!-- shoal-evidence:v1:start -->\n{"formatVersion":1,"record":{"type":"REVIEWED","reviewerNodeId":200,"targetRepositoryId":300,';
for (const type of ['REVIEWED', 'RE_REVIEWED', 'STAR_REVOKED', 'REVOKED_EXTERNALLY']) {
  const damaged = { ...comments[1], body: damagedMachine.replace('REVIEWED', type) };
  for (const candidate of [repository(), repository({ id: 400, fork: true, parent: { id: rootId } })]) {
    const result = await run(candidate, [comments[0], damaged]);
    assert.deepEqual(result.metrics, { ...pending.metrics, invalidReviewCommentCount: 1 });
    assert.deepEqual((await run(candidate, [comments[0], damaged], 'open')).metrics, pending.metrics);
    assert.equal((await run(candidate, [damaged])).metrics.validReviewRequestIssueCount, 0);
  }
}
const damagedInitial = { ...comments[1], body: damagedMachine };
const laterInitial = { ...comments[1], id: 4, created_at: '2026-10-01T02:00:00Z' };
const repeatedInitial = await run(repository(), [comments[0], damagedInitial, laterInitial]);
assert.deepEqual(repeatedInitial.metrics, { ...pending.metrics, invalidReviewCommentCount: 2 });
const openRepeatedInitial = await run(repository(), [comments[0], damagedInitial, laterInitial], 'open');
assert.deepEqual(openRepeatedInitial.metrics, pending.metrics);
for (const first of [
  { ...damagedInitial, user: author },
  { ...damagedInitial, body: damagedMachine.replace('200', '999') },
  { ...damagedInitial, body: damagedMachine.replace('300', '999') },
  { ...damagedInitial, body: damagedMachine.replace('300', '300oops') },
]) {
  assert.deepEqual((await run(repository(), [comments[0], first, laterInitial])).metrics,
    { ...root.metrics, invalidReviewCommentCount: 1 });
}
for (const body of ['Review Result: PASS', JSON.stringify(formal),
  damagedMachine.slice(damagedMachine.indexOf('{')),
  '<!-- shoal-evidence:v1:start -->{"record":{"reviewerNodeId":200,"targetRepositoryId":300,',
  'shoal-review-event:v1\n' + JSON.stringify(formal), comments[0].body + comments[0].body,
  comments[0].body.replace('"formatVersion":1', '"formatVersion":99'),
  '<!-- shoal-evidence:v1:start -->garbage<!-- shoal-evidence:v1:end -->']) {
  const result = await run(repository(), [comments[0], { ...comments[1], body }]);
  assert.equal(result.metrics.invalidReviewCommentCount, 0);
  assert.equal(result.metrics.completedReviewRequestCount, 0);
}
for (const type of ['RE_REVIEWED', 'STAR_REVOKED', 'REVOKED_EXTERNALLY']) {
  const pass = type === 'RE_REVIEWED';
  const result = await run(repository(), [...comments, lifecycle,
    judgmentComment({ ...formal, type, verdict: pass ? 'PASS' : 'FAIL', actualStarState: pass },
      { id: 4, created_at: '2026-10-01T02:00:00Z' })], 'closed', [trigger]);
  assert.equal(result.metrics.completedReviewRequestCount, 2);
  assert.equal(result.metrics.invalidReviewCommentCount, 0);
}

const manifest = JSON.parse(await readFile('dist/action-package/package-manifest.json', 'utf8'));

assert.ok(manifest.files.every(({ path }) => !path.includes('.test.') && !path.includes('/fixtures/')));
assert.ok(manifest.files.every(({ path }) => !path.includes('/fixtures/')));
console.log('Packaged Action: Root/direct-fork accounting, seven Membership negatives, schema v2 workload partition and terminal resolution, read-only IO, no shipped tests PASS.');
