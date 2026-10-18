import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';

register();

// Real transport and assembled projection integration.
const { GitHubApi } = await import('../github_api/index.ts');
const { buildNetworkProjection, validateProjection } = await import('./index.ts');
const { networkRoot } = await import('~app/protocol/services/network_compatibility');

const repository = networkRoot.fullName;
const prefix = `/repos/${repository}`;
const rootOwner = { id: 127829492, login: 'taco3064', type: 'User', avatar_url: 'https://github.com/avatar.png', html_url: 'https://github.com/taco3064' };
const rootNode = { id: networkRoot.repositoryId, full_name: repository, html_url: `https://github.com/${repository}`, created_at: '2026-01-01T00:00:00Z', default_branch: 'main', fork: false, has_issues: true, owner: rootOwner };
const request = (number) => ({ number, state: 'open', body: '### Repository name\n\ntarget\n\n### Invitation message\n\n_No response_', user: { id: 55, login: 'requester', type: 'User' }, url: `https://api.github.com${prefix}/issues/${number}` });

async function scan({ fail = '', empty = false, malformedLink = false } = {}) {
  const calls = [];
  const source = new GitHubApi('fixture-token', async (input, init) => {
    assert.equal(init.method, undefined, 'Scan performs reads only');
    const url = new URL(input);
    const path = url.pathname;
    const page = Number(url.searchParams.get('page') ?? 1);
    calls.push(`${path}:${page}`);
    if (path === fail) return new Response('unavailable', { status: 503 });
    if (path === prefix) return Response.json(rootNode);
    if (path === `${prefix}/forks`) return Response.json([]);
    if (path === `${prefix}/commits/main`) return Response.json({ sha: 'a'.repeat(40) });
    if (path.startsWith(`${prefix}/contents/`)) return new Response('', { status: 404 });
    if (path === `${prefix}/actions/runs`) return Response.json({ workflow_runs: [] });
    if (path === `${prefix}/issues`) {
      assert.equal(url.searchParams.get('state'), 'open');
      if (empty) return Response.json([]);
      return Response.json(page === 1 ? [request(9)] : [request(2)], {
        headers: page === 1 ? { link: malformedLink ? '<https://foreign.invalid/issues>; rel="next"' : `<https://api.github.com${prefix}/issues?state=open&page=2&per_page=100>; rel="next"` } : {},
      });
    }
    if (/\/issues\/\d+\/comments$/.test(path)) {
      // A second page of ordinary comments must also be consumed.
      const issueNumber = Number(path.split('/').at(-2));
      return Response.json(page === 1 ? [{ id: issueNumber, body: 'Ordinary prose', user: rootOwner, created_at: '2026-01-01T00:00:00Z', url: `https://api.github.com${prefix}/issues/comments/${issueNumber}`, issue_url: `https://api.github.com${prefix}/issues/${issueNumber}` }] : [], {
        headers: page === 1 ? { link: `<https://api.github.com${path}?page=2&per_page=100>; rel="next"` } : {},
      });
    }
    throw new Error(`Unexpected read: ${input}`);
  }, { retryBudgetMs: 0 });
  return { projection: await buildNetworkProjection(source, '2026-10-19T00:00:00Z'), calls };
}

const { projection, calls } = await scan();
assert.deepEqual(projection.reviewers[0].awaitingAdmission, { issueNumbers: [2, 9] });
assert.equal(projection.reviewers[0].summaryStatus, 'unavailable');
assert.deepEqual(projection.reviewers[0].summary, { status: 'unavailable', stale: false });
assert.ok(calls.includes(`${prefix}/issues:2`));
assert.ok(calls.includes(`${prefix}/issues/2/comments:2`));
assert.ok(calls.includes(`${prefix}/issues/9/comments:2`));
assert.deepEqual((await scan({ empty: true })).projection.reviewers[0].awaitingAdmission.issueNumbers, []);
await assert.rejects(scan({ fail: `${prefix}/issues` }), /503/);
await assert.rejects(scan({ fail: `${prefix}/issues/2/comments` }), /503/);
await assert.rejects(scan({ malformedLink: true }), /pagination/);
for (const issueNumbers of [[9, 2], [2, 2], [0], [-1], [1.2], [Number.MAX_SAFE_INTEGER + 1], ['2']]) {
  const invalid = structuredClone(projection);
  invalid.reviewers[0].awaitingAdmission.issueNumbers = issueNumbers;
  assert.throws(() => validateProjection(invalid));
}
const absent = structuredClone(projection);
delete absent.reviewers[0].awaitingAdmission;
assert.throws(() => validateProjection(absent));
console.log('Intake integration PASS: real issue/comment pagination, unavailable Summary, zero, required-read failure, invalid projection.');
