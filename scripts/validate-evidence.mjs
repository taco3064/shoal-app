import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../dist/action-package/loader.mjs', import.meta.url);
const { renderEvidenceComment, decodeEvidenceDocument, parseProtocolComment, reviewProtocol } =
  await import('../dist/action-package/src/protocol/services/review_protocol/index.js');
const admission = { reviewerNodeId: 200, targetRepositoryId: 300, repositoryName: 'target' };
const judgment = {
  type: 'REVIEWED', reviewerNodeId: 200, targetRepositoryId: 300,
  targetRepositoryFullName: 'requester/target', targetDefaultBranch: 'main',
  targetCommit: 'a'.repeat(40), reviewPolicyPath: 'README.md', reviewPolicyCommit: 'b'.repeat(40),
  verdict: 'PASS', actualStarState: true, reviewedAt: '2026-10-01T00:00:00Z',
};
const presentation = { requestAuthor: 'requester', explanation: 'Checked policy.\n</details><!-- shoal-evidence:v9:start --> PASS' };
const { startSentinel: start, endSentinel: end } = reviewProtocol.evidence;
const wrap = (payload) => `${start}\n${payload}\n${end}`;
const records = [admission, judgment,
  ...['RE_REVIEWED', 'STAR_REVOKED', 'REVOKED_EXTERNALLY'].map(type => ({
    ...judgment, type, verdict: type === 'RE_REVIEWED' ? 'PASS' : 'FAIL', actualStarState: type === 'RE_REVIEWED',
  })),
  ...['RE_REVIEW_REQUESTED', 'STALE_DETECTED', 'ENDORSEMENT_DRIFT'].map(type => ({
    type, reviewerNodeId: 200, targetRepositoryId: 300, requestIssueNumber: 2,
    eligibilityTargetCommit: 'c'.repeat(40), reviewPolicyCommit: 'b'.repeat(40),
    reason: 'TARGET_CHANGED', automationProvenance: null,
  })),
];
for (const record of records) {
  const body = renderEvidenceComment(record, presentation);
  assert.equal(body, renderEvidenceComment(record, presentation));
  assert.deepEqual(decodeEvidenceDocument(body).document.record, record);
  assert.deepEqual(decodeEvidenceDocument(body).document.presentation, presentation);
  assert.deepEqual(parseProtocolComment(body).value, record);
  assert.deepEqual(parseProtocolComment('Fake prose FAIL\n' + body.slice(body.indexOf(start))), parseProtocolComment(body));
  assert.deepEqual(parseProtocolComment(wrap(JSON.stringify({ presentation: {}, record, formatVersion: 1 }))).value, record);
}
const good = renderEvidenceComment(judgment, presentation);
const payload = JSON.stringify({ formatVersion: 1, record: judgment, presentation: {} });
assert.equal(parseProtocolComment(wrap(payload)).kind, 'judgment');
for (const body of [
  good + good, start + good, good + end, good.replace(end, ''),
  good.replaceAll('shoal-evidence:v1:', 'shoal-evidence:v2:'),
  wrap(payload.replace('"formatVersion":1', '"formatVersion":2')),
  wrap(payload.replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1')),
  wrap(payload.replace('"verdict":"PASS"', '"verdict":"FAIL","verdict":"PASS"')),
  wrap(payload.replace('"verdict":"PASS"', '"verdict":"FAIL","verdi\\u0063t":"PASS"')),
  wrap(JSON.stringify({ formatVersion: 1, record: judgment })),
  wrap(JSON.stringify({ formatVersion: 1, record: judgment, presentation: {}, foreign: true })),
]) {
  assert.notEqual(decodeEvidenceDocument(body).kind, 'present', body);
  assert.deepEqual(parseProtocolComment(body), { kind: 'invalid-formal-result', initialReviewEvidence: null }, body);
}
for (const body of [good.replace(start, ''), wrap('{'),
  wrap(JSON.stringify({ formatVersion: 99, record: admission, presentation: { explanation: 'REVIEWED PASS' } })),
  wrap(JSON.stringify({ formatVersion: 99, record: {}, presentation: { type: 'REVIEWED' } })),
  wrap(JSON.stringify({ formatVersion: 99, record: { nested: { type: 'REVIEWED' } }, presentation: {} })),
  wrap(JSON.stringify({ formatVersion: 99, record: [{ type: 'REVIEWED' }], presentation: {} })),
]) {
  assert.equal(parseProtocolComment(body).kind, 'none');
}
for (const payload of [
  `{"formatVersion":1,"record":{"type":"REVIEWED","type":"unknown"},"presentation":{}}`,
  `{"formatVersion":1,"record":{"type":"REVIEWED"},"record":${JSON.stringify(admission)},"presentation":{}}`,
]) {
  assert.deepEqual(parseProtocolComment(wrap(payload)), { kind: 'invalid-formal-result', initialReviewEvidence: null });
}
for (const prose of ['Review Result: PASS', 'REVIEWED', JSON.stringify(judgment),
  'shoal-review-event:v1\n' + JSON.stringify(judgment), '<summary>Formal Shoal evidence</summary>',
  'PASS verdict actualStarState ' + JSON.stringify(presentation)]) {
  assert.equal(parseProtocolComment(prose).kind, 'none');
}
const invalid = { ...judgment, targetCommit: 'short' };
assert.equal(parseProtocolComment(renderEvidenceComment(invalid, presentation)).kind, 'invalid-formal-result');
const missing = { ...judgment }; delete missing.targetCommit;
assert.equal(parseProtocolComment(wrap(JSON.stringify({ formatVersion: 1, record: missing,
  presentation: { explanation: judgment.targetCommit } }))).kind, 'invalid-formal-result');
const visible = good.slice(0, good.indexOf(start));
for (const field of [judgment.targetCommit, judgment.reviewPolicyCommit, 'PASS', 'requester/target', 'starred']) {
  assert.ok(visible.includes(field));
}
console.log('Evidence codec: all record types, deterministic round-trip, prose isolation, duplicate keys, malformed/foreign envelopes PASS.');
