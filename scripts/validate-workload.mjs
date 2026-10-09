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

const firstPage = [...projection.reviewers].sort((a, b) =>
  a.username.toLowerCase().localeCompare(b.username.toLowerCase(), 'en')
  || a.repositoryId - b.repositoryId).slice(0, 50);
const visible = new Set(firstPage.map((reviewer) => reviewer.repositoryId));

assert.equal(cards.length, firstPage.length);

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

  assert.equal(Boolean(card), visible.has(reviewer.repositoryId),
    'SSR cards represent the initial Directory page: ' + reviewer.username);
  assert.ok(directory.includes('/reviewers/' + encodeURIComponent(reviewer.username) + '/'),
    'Every participant has a static Directory link: ' + reviewer.username);

  if (card) {
    assert.equal(card.includes('class="workload-grid"'), false);
    assert.equal(card.includes('Selected accepted workload'), false);
    assert.equal(card.includes('<dt>Pending</dt>'), false);
    assert.equal(card.includes('<dt>Completed</dt>'), false);
    assert.equal(card.includes('state-fallback'), selected.status === 'fallback');
    assert.equal(card.includes('state-current'), selected.status === 'current');
    assert.equal(card.includes('state-unavailable'), false);
  }

  assert.equal(detail.includes('class="workload-grid"'), hasWorkload);

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
  }
}

console.log(
  'Workload artifacts PASS: ' +
    projection.reviewers.length +
    ' participant links and details; first-page cards, exact values, absence, zero, freshness, provenance.',
);
