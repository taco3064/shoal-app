import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';

register();

const { observeAwaitingAdmission } = await import('./index.ts');
const { renderEvidenceComment, parseProtocolComment } = await import('~app/protocol/services/review_protocol');
const owner = { id: 1, login: 'reviewer', type: 'User' };
const node = { id: 10, full_name: 'reviewer/shoal-station', owner };
const base = `https://api.github.com/repos/${node.full_name}`;
const bot = { id: 999, login: 'dependabot[bot]', type: 'Bot' };
const requestBody = '### Repository name\n\ntarget';
const admission = { reviewerNodeId: 10, targetRepositoryId: 20, repositoryName: 'target' };
const judgment = {
  type: 'REVIEWED', reviewerNodeId: 10, targetRepositoryId: 20,
  targetRepositoryFullName: 'requester/target', targetDefaultBranch: 'main',
  targetCommit: 'a'.repeat(40), reviewPolicyPath: 'README.md',
  reviewPolicyCommit: 'b'.repeat(40), verdict: 'PASS', actualStarState: true,
  reviewedAt: '2026-10-19T00:00:00Z',
};
const issue = (number, additions = {}) => ({
  number, state: 'open', body: requestBody,
  user: { id: 2, login: 'requester', type: 'User' },
  url: `${base}/issues/${number}`, ...additions,
});
let nextComment = 1;
const comment = (number, record, additions = {}) => ({
  id: nextComment, url: `${base}/issues/comments/${nextComment++}`,
  issue_url: `${base}/issues/${number}`,
  body: renderEvidenceComment(record, { requestAuthor: 'requester' }), user: owner,
  created_at: '2026-10-19T00:00:00Z', ...additions,
});
const malformedInitial = renderEvidenceComment({ ...judgment, targetCommit: 'invalid' });
const damagedInitial = renderEvidenceComment(judgment).replace('"actualStarState":true', '"actualStarState":tru');
assert.equal(parseProtocolComment(malformedInitial).kind, 'invalid-formal-result');
assert.equal(parseProtocolComment(damagedInitial).kind, 'invalid-formal-result');
const rows = [
  [issue(9), []], [issue(2), []], // Duplicate targets count as separate candidates.
  [issue(3), [comment(3, admission)]],
  [issue(4), [comment(4, judgment)]],
  [issue(5, { state: 'closed' }), []],
  [issue(6, { pull_request: {}, user: bot }), []],
  [issue(7, { body: 'ordinary prose' }), []],
  [issue(8), [comment(8, admission, { user: { ...owner, id: 99 } })]],
  [issue(10), [comment(10, { ...admission, reviewerNodeId: 99 })]],
  [issue(11), [comment(11, { ...judgment, type: 'RE_REVIEWED' })]],
  [issue(12), [comment(12, { ...judgment, targetRepositoryId: 21 })]],
  [issue(13), [comment(13, admission), comment(13, { ...admission, targetRepositoryId: 21 }), comment(13, judgment)]],
  [issue(14), [comment(14, judgment, { user: { ...owner, id: 99 } })]],
  [issue(15), [comment(15, judgment, { body: 'PASS - admitted by reviewer', user: bot })]],
  [issue(22), [comment(22, admission, { user: bot })]],
  [issue(16), [comment(16, judgment, { body: malformedInitial })]],
  [issue(17), [comment(17, judgment, { body: damagedInitial }), comment(17, judgment)]],
  [issue(18), [comment(18, admission), comment(18, { ...admission, repositoryName: 'TARGET' })]],
  // An admitted thread remains admitted after the current Request body changes.
  [issue(19), [comment(19, { ...admission, repositoryName: 'original-target' })]],
  // Foreign damaged evidence cannot consume the Reviewer's initial judgment.
  [issue(20), [comment(20, judgment, { body: damagedInitial, user: { ...owner, id: 99 } }), comment(20, judgment)]],
  [issue(23, { body: '### Repository name\n\nnewname' }), [comment(23, { ...judgment, targetRepositoryFullName: 'requester/oldname' })]],
  [issue(24, { user: { id: 2, login: 'newrequester', type: 'User' } }), [comment(24, { ...judgment, targetRepositoryFullName: 'oldrequester/target' })]],
  [issue(25, { user: { id: 3, login: 'requester', type: 'User' } }), [comment(25, judgment)]],
  [issue(21), [comment(21, admission, { body: renderEvidenceComment(admission, { requestAuthor: 'requester' }).replace('"targetRepositoryId":20', '"targetRepositoryId":0') })]],
];
const targetReads = [];
const source = {
  async json(path) {
    targetReads.push(path);
    assert.ok(['/repos/requester/target', '/repos/requester/newname', '/repos/newrequester/target'].includes(path));
    return { id: 20, owner: { id: 2 } };
  },
  async pages(path) {
    if (path.includes('?state=open')) return rows.map(([value]) => value);
    const number = Number(path.split('/').at(-2));
    return rows.find(([value]) => value.number === number)[1];
  },
};
assert.deepEqual(await observeAwaitingAdmission(source, node), {
  issueNumbers: [2, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21, 22, 25],
});
assert.deepEqual(targetReads, [
  '/repos/requester/target', '/repos/requester/target', '/repos/requester/target',
  '/repos/requester/newname', '/repos/newrequester/target', '/repos/requester/target',
], 'Only authoritative initial Manual Review evidence triggers identity reads');
for (const status of [404, 410, 403, 503]) {
  await assert.rejects(observeAwaitingAdmission({
    async pages(path) { return path.includes('?') ? [issue(4)] : [comment(4, judgment)]; },
    async json() { throw new Error(`Target HTTP ${status}`); },
  }, node), new RegExp(`Target HTTP ${status}`));
}
await assert.rejects(observeAwaitingAdmission({
  async pages(path) { return path.includes('?') ? [issue(4)] : [comment(4, judgment)]; },
  async json() { return { id: 20 }; },
}, node), /Invalid public Manual Review Target identity/);
const foreign = { ...comment(9, admission), issue_url: `${base}/issues/100` };
await assert.rejects(observeAwaitingAdmission({ async pages(path) {
  return path.includes('?') ? [issue(9)] : [foreign];
} }, node), /Invalid public Issue comment/);
await assert.rejects(observeAwaitingAdmission(source, { ...node, owner: { ...owner, id: undefined } }), /owner identity/);
console.log('Intake evidence PASS: canonical initial evidence, author identity, conflicting Admissions, foreign/malformed/noninitial evidence, duplicate targets, thread binding, stable target/account renames, bounded identity reads, required identity-read failures.');
