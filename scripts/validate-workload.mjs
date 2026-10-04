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

assert.equal(cards.length, projection.reviewers.length);

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

  assert.ok(card, 'Static Directory card: ' + reviewer.username);
  assert.equal(card.includes('class="workload-grid"'), hasWorkload);
  assert.equal(detail.includes('class="workload-grid"'), hasWorkload);
  assert.equal(card.includes('state-fallback'), selected.status === 'fallback');
  assert.equal(card.includes('state-current'), selected.status === 'current');
  assert.equal(card.includes('state-unavailable'), false);

  if (hasWorkload) {
    const {
      pendingReviewRequestCount: pending,
      completedReviewRequestCount: completed,
    } = selected.summary.metrics;

    for (const html of [card, detail]) {
      assert.ok(html.includes('<dt>Pending</dt><dd>' + pending + '</dd>'));
      assert.ok(html.includes('<dt>Completed</dt><dd>' + completed + '</dd>'));
      assert.equal(
        html.includes('Prior accepted workload · stale'),
        selected.status === 'fallback',
      );
    }
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
  }
}

console.log(
  'Workload artifacts PASS: ' +
    projection.reviewers.length +
    ' cards and details; exact values, absence, zero, freshness, provenance.',
);
