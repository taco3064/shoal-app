import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { allowedSummaryWorkflows } from '../dist/action-package/src/protocol/services/network_compatibility/index.js';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync('src/protocol/services/network_compatibility/fixtures/human-first-summary.yml');
const expected = '0dee3b797307225e38b475e0456cff6434ca53c4b0580fb3f4a11dfdc5eece35';
assert.equal(digest(bytes), expected);
const action = '47e1c3ab5762d66e6f49c3f2a15c133a9785679c';
assert.ok(bytes.toString().includes(`uses: taco3064/shoal-action@${action}`));
assert.deepEqual(allowedSummaryWorkflows.get(expected), {
  actionCommit: action, reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 2 },
});
for (const drift of [Buffer.concat([bytes, Buffer.from(' ')]),
  Buffer.from(bytes.toString().replace(action, 'a'.repeat(40))),
  Buffer.concat([Buffer.from('# PASS formal Review explanation\n'), bytes])]) {
  assert.equal(allowedSummaryWorkflows.has(digest(drift)), false);
}
const legacy = [
  '3b66f6c4afb545bbf1ad847aed96d0dd8c336e6df100c6b898250a0bddf58fd6',
  '616eea6f7ce06c0991f0023768c02c79a99d53aeb2f845c0934461720546a999',
  'd586ab618c894d9729e21d7105becb0ca805df576198353293b1f77818927e99',
  '70d1011d0b1a6a68677bc891a408f2b73af868a89d283bffdfefa2fd24a6b9d2',
];
for (const key of legacy) {
  assert.deepEqual(allowedSummaryWorkflows.get(key), {
    actionCommit: key.startsWith('70d1011d') ? 'e1824eaa4766891a6fe56bb1ea2dfb3f13541e73' : 'b4d72405ebc03afc35d29093302b5593e1ddff1b',
    reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 1 },
  });
}
for (const key of ['b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105',
  'f6cda44c7e6e12117dac3c1f1c145bb69283eb3cfe66690ba67adddd3b4e89bd']) {
  assert.deepEqual(allowedSummaryWorkflows.get(key), {
    actionCommit: '4918e1afe85f15f8fe263eaf2866cd02a1f70a62',
    reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 2 },
  });
}
const repairedBytes = readFileSync('src/protocol/services/network_compatibility/fixtures/f01-summary.yml');
const repairedDigest = '08c07806fa86966739e14c6ad62c75e7f91210ae565072fa327b5ab7dc830c59';
const repairedAction = 'bd75984561987d390413a176cd8e7982aee2cb9a';
assert.equal(digest(repairedBytes), repairedDigest);
assert.equal(repairedBytes.toString(), bytes.toString().replace(action, repairedAction));
assert.deepEqual(allowedSummaryWorkflows.get(repairedDigest), {
  actionCommit: repairedAction, reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 2 },
});
for (const drift of [Buffer.concat([repairedBytes, Buffer.from(' ')]),
  Buffer.from(repairedBytes.toString().replace(repairedAction, 'a'.repeat(40)))]) {
  assert.equal(allowedSummaryWorkflows.has(digest(drift)), false);
}
const damagedRepairBytes = readFileSync('src/protocol/services/network_compatibility/fixtures/f02-summary.yml');
const damagedRepairDigest = 'acf3b8edc35584309a73bfe67e2c6fd453acb07e9a1033de34f4f6ab039e042f';
const damagedRepairAction = '1916eb85cd251b073520956512cd9b5549fba2a7';
assert.equal(digest(damagedRepairBytes), damagedRepairDigest);
assert.equal(damagedRepairBytes.toString(), repairedBytes.toString().replace(repairedAction, damagedRepairAction));
assert.deepEqual(allowedSummaryWorkflows.get(damagedRepairDigest), {
  actionCommit: damagedRepairAction, reviewerSummary: { protocolVersion: 1, summarySchemaVersion: 2 },
});
for (const drift of [Buffer.concat([damagedRepairBytes, Buffer.from(' ')]),
  Buffer.from(damagedRepairBytes.toString().replace(damagedRepairAction, 'a'.repeat(40)))]) {
  assert.equal(allowedSummaryWorkflows.has(digest(drift)), false);
}
assert.equal(allowedSummaryWorkflows.size, 9);
console.log('Canonical trust: exact Stage A generations, byte-drift refusal, all historical bindings unchanged PASS.');
