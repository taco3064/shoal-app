// Verify the production HTML against its published projection, without JS.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'dist');
const projection = JSON.parse(
  await readFile(resolve(output, 'data/network.json'), 'utf8'),
);
const directory = await readFile(resolve(output, 'reviewers/index.html'), 'utf8');
const cards = [
  ...directory.matchAll(/<article class="reviewer-card">([\s\S]*?)<\/article>/g),
].map(([, card]) => card);

assert.equal(cards.length, Math.min(50, projection.reviewers.length));
for (const card of cards) {
  assert.ok(projection.reviewers.some((reviewer) => card.includes(
    '/reviewers/' + encodeURIComponent(reviewer.username) + '/',
  )), 'Every static card belongs to the published projection');
}

for (const reviewer of projection.reviewers) {
  const selected = reviewer.summary;
  const card = cards.find((html) =>
    html.includes('/reviewers/' + encodeURIComponent(reviewer.username) + '/'),
  );
  const detail = await readFile(
    resolve(output, 'reviewers/' + reviewer.username + '/index.html'),
    'utf8',
  );
  const hasWorkload =
    selected.status !== 'unavailable' && selected.summary.summarySchemaVersion === 2;

  if (card) {
    assert.equal(card.includes('class="workload-grid"'), false);
    assert.equal(card.includes('Selected accepted workload'), false);
    assert.equal(card.includes('<dt>Pending</dt>'), false);
    assert.equal(card.includes('<dt>Completed</dt>'), false);
    assert.equal(card.includes('Awaiting Admission'), false);
    assert.equal(card.includes('admission-panel'), false);
    assert.equal(card.includes('state-fallback'), selected.status === 'fallback');
    assert.equal(card.includes('state-current'), selected.status === 'current');
    assert.equal(card.includes('state-unavailable'), false);
  } else {
    assert.ok(projection.reviewers.length > 50, 'Only pagination may omit a card');
  }
  const admission = detail.match(/<section class="detail-panel admission-panel"[\s\S]*?<\/section>/)?.[0];
  assert.ok(admission, 'Independent candidate observation: ' + reviewer.username);
  assert.ok(admission.includes('<h2 id="admission-title">Awaiting Admission</h2>'));
  assert.ok(admission.includes(
    '<dt>Open Review Request candidates</dt><dd>' +
    reviewer.awaitingAdmission.issueNumbers.length + '</dd>',
  ));
  const issueLinks = [...admission.matchAll(/href="([^"]+\/issues\/[0-9]+)"/g)]
    .map(([, href]) => href);
  assert.deepEqual(issueLinks, reviewer.awaitingAdmission.issueNumbers
    .map((number) => `${reviewer.repositoryUrl}/issues/${number}`));
  assert.ok(admission.includes(
    `<time dateTime="${projection.generatedAt}">${projection.generatedAt}</time>`,
  ) || admission.includes(
    `<time datetime="${projection.generatedAt}">${projection.generatedAt}</time>`,
  ));
  assert.match(admission, /Network Scan snapshot/);
  assert.match(admission, /GitHub Issue state may have changed/);
  assert.match(admission, /does not establish Requester Membership/);
  assert.match(admission, /Target validity, self-review exclusion/);
  assert.match(admission, /duplicate admissibility, or a Reviewer obligation/);
  assert.match(admission, /separate from formal Pending and Completed/);
  assert.match(admission, /not attested by the Reviewer Summary/);
  assert.match(admission, /Do not add these independent snapshots together/);
  assert.equal(detail.includes('class="workload-grid"'), hasWorkload);

  if (selected.status !== 'unavailable') {
    assert.ok(detail.includes(`href="${selected.source.transportUrl}"`));
    assert.ok(detail.includes(`href="${selected.source.runUrl}"`));
    assert.ok(detail.includes(selected.source.summaryDigest));
    assert.ok(detail.includes(selected.source.workflowCommit));
    assert.ok(detail.includes(selected.source.runStartedAt));
    assert.ok(detail.includes(`state-${selected.status}`));
    assert.ok(detail.includes('<dt>Review-backed Stars</dt>'));
    assert.match(detail, /Selected accepted Attempt/);
  }

  if (hasWorkload) {
    const {
      pendingReviewRequestCount: pending,
      completedReviewRequestCount: completed,
    } = selected.summary.metrics;

    assert.ok(detail.includes('<dt>Pending</dt><dd>' + pending + '</dd>'));
    assert.ok(detail.includes('<dt>Completed</dt><dd>' + completed + '</dd>'));
    assert.equal(
      detail.includes('Prior accepted workload · stale'),
      selected.status === 'fallback',
    );
    assert.ok(
      detail.indexOf('id="workload-title"') < detail.indexOf('id="policy-title"'),
    );
    assert.match(detail, /Review-backed Stars/);
    assert.match(detail, /Selected accepted Attempt/);
  } else if (selected.status !== 'unavailable') {
    assert.match(detail, /not available from this accepted Summary generation/);
    assert.match(detail, /Pending and Completed are absent, not zero/);
  } else {
    assert.match(detail, /No accepted Summary snapshot is selected/);
    assert.equal(detail.includes('id="workload-title"'), false);
    assert.equal(detail.includes('<dt>Pending</dt>'), false);
    assert.equal(detail.includes('<dt>Completed</dt>'), false);
    assert.equal(detail.includes('Selected accepted Attempt'), false);
  }
}

console.log(
  'Workload artifacts PASS: ' +
    cards.length + ' cards, ' + projection.reviewers.length +
    ' details; candidate counts/links, independent snapshot, exact workload values, absence, zero, freshness, provenance.',
);
