import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import ReviewerDirectory from '../ReviewerDirectory';
import type { DirectoryEntry } from '~app/guide/hooks/useReviewerDirectory';
import ReviewerWorkload from './index';

const { reviewers } = JSON.parse(
  readFileSync(
    new URL('../../services/directory/fixtures/network.json', import.meta.url),
    'utf8',
  ),
) as { reviewers: DirectoryEntry[] };

for (const reviewer of reviewers) {
  test('workload rendering preserves ' + reviewer.username, () => {
    const selected = reviewer.summary;

    const html = renderToStaticMarkup(
      <ReviewerWorkload selected={selected} explainAbsence />,
    );

    if (selected.status === 'unavailable') {
      assert.equal(html, '');
    } else if (selected.summary.summarySchemaVersion === 1) {
      assert.match(html, /not available from this accepted Summary generation/);
      assert.equal(html.includes('<dd>'), false);
    } else {
      const metrics = selected.summary.metrics;

      assert.match(html, /<dt>Pending<\/dt>/);
      assert.match(html, /<dt>Completed<\/dt>/);

      assert.ok(
        html.includes('<dd>' + metrics.pendingReviewRequestCount + '</dd>'),
      );

      assert.ok(
        html.includes('<dd>' + metrics.completedReviewRequestCount + '</dd>'),
      );

      assert.match(html, /does not count endorsements or rate this Reviewer/);

      assert.equal(
        html.includes('Prior accepted workload · stale'),
        selected.status === 'fallback',
      );
    }
  });
}

test('Directory SSR includes P/C only on v2 cards and preserves old badges', () => {
  const html = renderToStaticMarkup(
    <ReviewerDirectory reviewers={reviewers} />,
  );

  const cards = [
    ...html.matchAll(/<article class="reviewer-card">([\s\S]*?)<\/article>/g),
  ];

  assert.equal(cards.length, reviewers.length);

  for (const [index, [, card]] of cards.entries()) {
    const selected = reviewers[index].summary;

    const hasWorkload
      = selected.status !== 'unavailable'
        && selected.summary.summarySchemaVersion === 2;

    assert.equal(card.includes('class="workload-grid"'), hasWorkload);

    assert.equal(
      card.includes('Fallback · prior accepted snapshot'),
      selected.status === 'fallback',
    );

    assert.equal(
      card.includes('Current summary'),
      selected.status === 'current',
    );

    assert.equal(card.includes('state-unavailable'), false);
  }

  assert.equal(html.includes('Completion rate'), false);
  assert.equal(html.includes('sortBy=pending'), false);
});
