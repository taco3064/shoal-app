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
const repaired = {
  callerDigest: '08c07806fa86966739e14c6ad62c75e7f91210ae565072fa327b5ab7dc830c59',
  auxiliaryDigest: 'cc91666c5bf39398a3635e9e16d8daf1a0e8860ae83dfb4b8baa57da395a6934',
  actionCommit: '1c975c0ba9b7b41b2093bcf04d65b6c1df8c658a',
  actionPath: 'hosted-review/',
  runtimeSourceCommit: '257d957d72e8457ed2adbd5d5e02d686885d19dd',
  runtimeSourceTree: 'c27b0dba2d282c6c55bef1f1894d85144241d0ae',
  brokerFormatVersion: 1,
};
const repairedAuxiliary = readFileSync(root + 'f01-hosted.yml');
const repairedProvenanceBytes = readFileSync(root + 'f01-source-package.json');
const repairedProvenance = JSON.parse(repairedProvenanceBytes);
const repairedCaller = readFileSync('src/protocol/services/network_compatibility/fixtures/f01-summary.yml');

// Admission-time chain verification; production trust remains the exact registry.
function verifyChain(bytes, source, binding = expected) {
  assert.equal(digest(bytes), binding.auxiliaryDigest);
  const pins = [...bytes.toString().matchAll(/uses: taco3064\/shoal-action\/hosted-review@([a-f0-9]{40})/g)];
  assert.deepEqual(pins.map(match => match[1]), [binding.actionCommit, binding.actionCommit]);
  assert.equal(source.formatVersion, 1);
  assert.equal(source.actionPath + '/', binding.actionPath);
  assert.equal(source.sourceRepository, 'taco3064/gh-shoal');
  assert.equal(source.sourceCommit, binding.runtimeSourceCommit);
  assert.equal(source.sourceTree, binding.runtimeSourceTree);
}

verifyChain(auxiliary, provenance);
assert.equal(digest(caller), expected.callerDigest);
assert.deepEqual(hostedCapabilities, [legacy, expected, repaired]);
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
assert.equal(allowedSummaryWorkflows.size, 8);
assert.equal(resolveHostedCapability('08c07806fa86966739e14c6ad62c75e7f91210ae565072fa327b5ab7dc830c59', expected.auxiliaryDigest), null);

verifyChain(repairedAuxiliary, repairedProvenance, repaired);
assert.equal(digest(repairedCaller), repaired.callerDigest);
assert.deepEqual(repairedAuxiliary, Buffer.from(auxiliary.toString().replaceAll(expected.actionCommit, repaired.actionCommit)));
assert.deepEqual(resolveHostedCapability(repaired.callerDigest, repaired.auxiliaryDigest), repaired);
const repairedCanonical = {
  actionCommit: 'bd75984561987d390413a176cd8e7982aee2cb9a',
  reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 2 },
};
assert.deepEqual(allowedSummaryWorkflows.get(repaired.callerDigest), repairedCanonical);
for (const bytes of [Buffer.concat([repairedAuxiliary, Buffer.from(' ')]),
  Buffer.from(repairedAuxiliary.toString().replaceAll(repaired.actionCommit, expected.actionCommit))]) {
  assert.throws(() => verifyChain(bytes, repairedProvenance, repaired));
  assert.equal(resolveHostedCapability(repaired.callerDigest, digest(bytes)), null);
  assert.deepEqual(allowedSummaryWorkflows.get(repaired.callerDigest), repairedCanonical);
}
for (const unsupported of [null, 'unsupported', legacy.auxiliaryDigest, expected.auxiliaryDigest]) {
  assert.equal(resolveHostedCapability(repaired.callerDigest, unsupported), null);
  assert.deepEqual(allowedSummaryWorkflows.get(repaired.callerDigest), repairedCanonical);
}
for (const unsupportedCaller of ['unsupported', legacy.callerDigest, expected.callerDigest]) {
  assert.equal(resolveHostedCapability(unsupportedCaller, repaired.auxiliaryDigest), null);
}
for (const field of ['sourceCommit', 'sourceTree']) {
  assert.throws(() => verifyChain(repairedAuxiliary, { ...repairedProvenance, [field]: 'a'.repeat(40) }, repaired));
}

function verifyComments(comments, binding = expected) {
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
    const rejectedKind = record.type ? 'invalid-formal-result' : 'none';
    assert.equal(parseProtocolComment(body + body).kind, rejectedKind);
    assert.equal(parseProtocolComment(body.replaceAll('shoal-evidence:v1:', 'shoal-evidence:v99:')).kind, rejectedKind);
    assert.deepEqual(resolveHostedCapability(binding.callerDigest, binding.auxiliaryDigest), binding);
    types.push(record.type ?? 'ADMITTED');
  }
  assert.deepEqual(types, ['ADMITTED', 'REVIEWED', 'RE_REVIEWED', 'STAR_REVOKED']);
}

verifyComments(JSON.parse(readFileSync(root + 'human-first-evidence.json')));
verifyComments(JSON.parse(readFileSync(root + 'f01-evidence.json')), repaired);

// Optional independent repository audit uses immutable Git objects, never tags
// or working-copy line endings. Also checks every packaged byte and upstream file.
const [stationRepo, actionRepo, runtimeRepo, evidenceOutput] = process.argv.slice(2);
if (stationRepo || actionRepo || runtimeRepo || evidenceOutput) {
  assert.ok(stationRepo && actionRepo && runtimeRepo && evidenceOutput, 'Supply station, Action, runtime and actual evidence output');
  const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args]);
  const blob = (repo, ref, path) => git(repo, 'show', `${ref}:${path}`);
  const station = '49275d59a86a912a7d18b9ca6344011df76c921a';
  assert.equal(git(stationRepo, 'rev-parse', `${station}^{tree}`).toString().trim(), '86856d36fb4d168dab85d5158acee5871e85eea3');
  assert.equal(git(actionRepo, 'rev-parse', `${repaired.actionCommit}^{tree}`).toString().trim(), '73d37b76bbd79c441435837e0bbfd26fa8bb8eb6');
  assert.equal(git(runtimeRepo, 'rev-parse', `${repaired.runtimeSourceCommit}^{tree}`).toString().trim(), repaired.runtimeSourceTree);
  assert.deepEqual(blob(stationRepo, station, '.github/workflows/reviewer-summary.yml'), repairedCaller);
  assert.deepEqual(blob(stationRepo, '5b654281c8539157ab65e40c9b297de764156294', '.github/workflows/reviewer-summary.yml'), repairedCaller);
  assert.deepEqual(blob(stationRepo, station, '.github/workflows/hosted-review.yml'), repairedAuxiliary);
  assert.deepEqual(blob(actionRepo, repaired.actionCommit, 'hosted-source-package.json'), repairedProvenanceBytes);
  const files = git(actionRepo, 'ls-tree', '-r', '--name-only', repaired.actionCommit, '--', 'hosted-review').toString().trim().split('\n').map(path => path.slice('hosted-review/'.length));
  assert.deepEqual(files.sort(), Object.keys(repairedProvenance.files).sort());
  for (const [path, hash] of Object.entries(repairedProvenance.files)) {
    const bytes = blob(actionRepo, repaired.actionCommit, 'hosted-review/' + path);
    assert.equal(digest(bytes), hash, path);
    const prefix = 'vendor/github.com/taco3064/gh-shoal/';
    if (path.startsWith(prefix)) {
      assert.deepEqual(bytes, blob(runtimeRepo, repaired.runtimeSourceCommit, path.slice(prefix.length)));
    }
  }
  const actualComments = JSON.parse(readFileSync(evidenceOutput));
  assert.deepEqual(actualComments, JSON.parse(readFileSync(root + 'f01-evidence.json')));
  verifyComments(actualComments, repaired);
  console.log('Exact Station → Hosted Action → shared runtime Git-object chain verified.');
}
console.log('Hosted trust separation, historical binding, byte/source drift and actual lifecycle evidence passed.');
