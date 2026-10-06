import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('../dist/action-package/loader.mjs', import.meta.url);
const { hostedCapabilities, resolveHostedCapability } =
  await import('../dist/action-package/src/protocol/services/hosted_capability/index.js');
const { allowedSummaryWorkflows } =
  await import('../dist/action-package/src/protocol/services/network_compatibility/index.js');
const { decodeEvidenceDocument, parseProtocolComment, renderEvidenceComment, reviewProtocol } =
  await import('../dist/action-package/src/protocol/services/review_protocol/index.js');
const root = 'src/protocol/services/hosted_capability/fixtures/';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const auxiliary = readFileSync(root + 'human-first-hosted.yml');
const provenanceBytes = readFileSync(root + 'human-first-source-package.json');
const provenance = JSON.parse(provenanceBytes);
const caller = readFileSync('src/protocol/services/network_compatibility/fixtures/human-first-summary.yml');
const expected = {
  callerDigest: '0dee3b797307225e38b475e0456cff6434ca53c4b0580fb3f4a11dfdc5eece35',
  auxiliaryDigest: 'd249b9784349b631e6a42b252870eabdfc6aab359e22899dbc18f89431e7ac9b',
  actionCommit: 'ee10f943abab1438e553d00591e625a78b931846',
  actionPath: 'hosted-review/',
  runtimeSourceCommit: '980d9eaecb820c32d3693aea487a3b3029ed254e',
  runtimeSourceTree: '540b914ed13ce97841ae0685fd36c7e1179bcaa5',
  brokerFormatVersion: 1,
};
const legacy = {
  callerDigest: 'b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
  auxiliaryDigest: 'c75a1f6a57b319d849f23ddd26753fc49ba0cf7fff1a90ddcfc63b1b43300e88',
  actionCommit: 'e6686785c66d80bdf0494cee57828814703c2d65',
  actionPath: 'hosted-review/',
  runtimeSourceCommit: '230a97af21c45b8d8f0cdcd4a02d13dddd2c4730',
  runtimeSourceTree: 'db8cfb7ed4cb54c4bc60569b5e55ed36fa68452c',
  brokerFormatVersion: 1,
};

// Admission-time chain verification; production trust remains the exact registry.
function verifyChain(bytes, source) {
  assert.equal(digest(bytes), expected.auxiliaryDigest);
  const pins = [...bytes.toString().matchAll(/uses: taco3064\/shoal-action\/hosted-review@([a-f0-9]{40})/g)];
  assert.deepEqual(pins.map(match => match[1]), [expected.actionCommit, expected.actionCommit]);
  assert.equal(source.formatVersion, 1);
  assert.equal(source.actionPath + '/', expected.actionPath);
  assert.equal(source.sourceRepository, 'taco3064/gh-shoal');
  assert.equal(source.sourceCommit, expected.runtimeSourceCommit);
  assert.equal(source.sourceTree, expected.runtimeSourceTree);
}

verifyChain(auxiliary, provenance);
assert.equal(digest(caller), expected.callerDigest);
assert.deepEqual(hostedCapabilities, [legacy, expected]);
assert.deepEqual(resolveHostedCapability(expected.callerDigest, digest(auxiliary)), expected);
assert.deepEqual(resolveHostedCapability(legacy.callerDigest, legacy.auxiliaryDigest), legacy);
const canonical = allowedSummaryWorkflows.get(expected.callerDigest);
assert.deepEqual(canonical, {
  actionCommit: '47e1c3ab5762d66e6f49c3f2a15c133a9785679c',
  reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 2 },
});
for (const bytes of [Buffer.concat([auxiliary, Buffer.from(' ')]),
  Buffer.from(auxiliary.toString().replaceAll(expected.actionCommit, 'a'.repeat(40)))]) {
  assert.throws(() => verifyChain(bytes, provenance));
  assert.equal(resolveHostedCapability(expected.callerDigest, digest(bytes)), null);
  assert.deepEqual(allowedSummaryWorkflows.get(expected.callerDigest), canonical);
}
for (const unsupported of [null, 'unsupported', legacy.auxiliaryDigest]) {
  assert.equal(resolveHostedCapability(expected.callerDigest, unsupported), null);
  assert.deepEqual(allowedSummaryWorkflows.get(expected.callerDigest), canonical);
}
assert.equal(resolveHostedCapability('unsupported', expected.auxiliaryDigest), null);
for (const field of ['sourceCommit', 'sourceTree']) {
  assert.throws(() => verifyChain(auxiliary, { ...provenance, [field]: 'a'.repeat(40) }));
}
assert.equal(allowedSummaryWorkflows.size, 7);

function verifyComments(comments) {
  assert.equal(comments.length, 4);
  const types = [];
  for (const body of comments) {
    const decoded = decodeEvidenceDocument(body);
    assert.equal(decoded.kind, 'present');
    const { record, presentation } = decoded.document;
    assert.deepEqual(parseProtocolComment(body).value, record);
    assert.equal(Object.hasOwn(record, 'explanation'), false);
    assert.deepEqual(parseProtocolComment(renderEvidenceComment(record, presentation)).value, record);
    const formal = body.slice(body.indexOf(reviewProtocol.evidence.startSentinel));
    assert.deepEqual(parseProtocolComment('Fake PASS/FAIL explanation\n' + formal).value, record);
    assert.equal(parseProtocolComment(body + body).kind, 'none');
    assert.equal(parseProtocolComment(body.replaceAll('shoal-evidence:v1:', 'shoal-evidence:v99:')).kind, 'none');
    assert.deepEqual(resolveHostedCapability(expected.callerDigest, expected.auxiliaryDigest), expected);
    types.push(record.type ?? 'ADMITTED');
  }
  assert.deepEqual(types, ['ADMITTED', 'REVIEWED', 'RE_REVIEWED', 'STAR_REVOKED']);
}

verifyComments(JSON.parse(readFileSync(root + 'human-first-evidence.json')));

// Optional independent repository audit uses immutable Git objects, never tags
// or working-copy line endings. Also checks every packaged byte and upstream file.
const [stationRepo, actionRepo, runtimeRepo, evidenceOutput] = process.argv.slice(2);
if (stationRepo || actionRepo || runtimeRepo || evidenceOutput) {
  assert.ok(stationRepo && actionRepo && runtimeRepo && evidenceOutput, 'Supply station, Action, runtime and actual evidence output');
  const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args]);
  const blob = (repo, ref, path) => git(repo, 'show', `${ref}:${path}`);
  const station = '91dd6c8dd9d1a2c824c48772c752a5a7f51c7f29';
  assert.equal(git(stationRepo, 'rev-parse', `${station}^{tree}`).toString().trim(), '35e7406847dfddca9e35fbb7bfafdd1fd9270805');
  assert.equal(git(actionRepo, 'rev-parse', `${expected.actionCommit}^{tree}`).toString().trim(), '2c6069e17cdc171b184a26f441dd022f3ceb069e');
  assert.equal(git(runtimeRepo, 'rev-parse', `${expected.runtimeSourceCommit}^{tree}`).toString().trim(), expected.runtimeSourceTree);
  assert.deepEqual(blob(stationRepo, station, '.github/workflows/reviewer-summary.yml'), caller);
  assert.deepEqual(blob(stationRepo, station, '.github/workflows/hosted-review.yml'), auxiliary);
  assert.deepEqual(blob(actionRepo, expected.actionCommit, 'hosted-source-package.json'), provenanceBytes);
  const files = git(actionRepo, 'ls-tree', '-r', '--name-only', expected.actionCommit, '--', 'hosted-review').toString().trim().split('\n').map(path => path.slice('hosted-review/'.length));
  assert.deepEqual(files.sort(), Object.keys(provenance.files).sort());
  for (const [path, hash] of Object.entries(provenance.files)) {
    const bytes = blob(actionRepo, expected.actionCommit, 'hosted-review/' + path);
    assert.equal(digest(bytes), hash, path);
    const prefix = 'vendor/github.com/taco3064/gh-shoal/';
    if (path.startsWith(prefix)) {
      assert.deepEqual(bytes, blob(runtimeRepo, expected.runtimeSourceCommit, path.slice(prefix.length)));
    }
  }
  verifyComments(JSON.parse(readFileSync(evidenceOutput)));
  console.log('Exact Station → Hosted Action → shared runtime Git-object chain verified.');
}
console.log('Hosted trust separation, historical binding, byte/source drift and actual lifecycle evidence passed.');
