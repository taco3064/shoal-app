import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';

register('../dist/action-package/loader.mjs', import.meta.url);
const { runReviewerSummaryAction } = await import('../dist/action-package/src/action/index.js');

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
    body: 'shoal-review-admission:v1\n' + JSON.stringify({
      reviewerNodeId: reviewerId, targetRepositoryId: targetId, repositoryName: 'target',
    }),
  },
  {
    id: 2,
    body: 'shoal-review-event:v1\n' + JSON.stringify({
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

async function run(candidate) {
  const routes = {
    '/repos/reviewer/station': repository({ id: reviewerId, owner: reviewer, full_name: 'reviewer/station' }),
    '/repos/reviewer/station/issues': [{
      number: 1, state: 'closed', user: author,
      body: '### Repository name\n\ntarget\n\n### Invitation message\n\n_No response_',
    }],
    '/repos/reviewer/station/issues/1/comments': comments,
    '/repos/reviewer/station/commits': [{ sha: policyCommit }],
    '/repos/requester/station': candidate,
    '/users/requester/repos': [],
    '/repos/requester/target': repository({ id: targetId, name: 'target', full_name: 'requester/target' }),
    '/repos/requester/target/branches/main': { commit: { sha: targetCommit } },
    '/users/reviewer/starred': [repository({ id: targetId })],
  };

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
  assert.equal(result.json.summarySchemaVersion, 1);
  return result.json;
}

const root = await run(repository());
const fork = await run(repository({ id: 400, fork: true, parent: { id: rootId } }));
assert.deepEqual(root, fork);
assert.deepEqual(root.metrics, {
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
}

const manifest = JSON.parse(await readFile('dist/action-package/package-manifest.json', 'utf8'));
assert.ok(manifest.files.every(({ path }) => !path.includes('.test.')));
console.log('Packaged Action: Root/direct-fork accounting, seven Membership negatives, unchanged schema, read-only IO, no shipped tests PASS.');
