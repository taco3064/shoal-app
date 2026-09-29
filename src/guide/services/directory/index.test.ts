import assert from 'node:assert/strict';
import { test } from 'node:test';
import { derivedMetrics } from './index';

test('zero denominator remains unavailable; real zero share remains 0%', () => {
  const empty = derivedMetrics({
    reviewBackedStarCount: 0,
    validReviewRequestIssueCount: 0,
    reReviewRequestIssueCount: 0,
    invalidReviewCommentCount: 2,
  });

  assert.equal(empty.currentEndorsementShare, null);
  assert.equal(empty.reReviewRequestShare, null);
  assert.equal(empty.reReviewRequestIntensity, null);

  const noEndorsement = derivedMetrics({
    reviewBackedStarCount: 0,
    validReviewRequestIssueCount: 3,
    reReviewRequestIssueCount: 1,
    invalidReviewCommentCount: 0,
  });

  assert.equal(noEndorsement.initialReviewRequestCount, 2);
  assert.equal(noEndorsement.currentEndorsementShare, 0);
  assert.equal(noEndorsement.reReviewRequestShare, 1 / 3);
});
