import type {
  ReviewerSummaryMetrics,
} from '~app/protocol/services/reviewer_summary_schema';

export function derivedMetrics(metrics: ReviewerSummaryMetrics) {
  const initialReviewRequestCount
    = metrics.validReviewRequestIssueCount - metrics.reReviewRequestIssueCount;

  return {
    initialReviewRequestCount,
    currentlyNotEndorsedCount:
      initialReviewRequestCount - metrics.reviewBackedStarCount,
    currentEndorsementShare:
      ratio(metrics.reviewBackedStarCount, initialReviewRequestCount),
    reReviewRequestShare:
      ratio(metrics.reReviewRequestIssueCount, metrics.validReviewRequestIssueCount),
    reReviewRequestIntensity:
      ratio(metrics.reReviewRequestIssueCount, initialReviewRequestCount),
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}
