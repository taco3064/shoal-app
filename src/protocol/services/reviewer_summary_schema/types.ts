export type ReviewerSummaryMetricsV1 = {
  reviewBackedStarCount: number;
  validReviewRequestIssueCount: number;
  reReviewRequestIssueCount: number;
  invalidReviewCommentCount: number;
};

export type ReviewerSummaryMetricsV2 = ReviewerSummaryMetricsV1 & {
  pendingReviewRequestCount: number;
  completedReviewRequestCount: number;
};

export type ReviewerSummaryMetrics = ReviewerSummaryMetricsV1 | ReviewerSummaryMetricsV2;

type ReviewerSummaryIdentity = {
  protocolVersion: 1;
  reviewerNode: {
    repositoryId: number;
  };
};

export type ReviewerSummaryV1 = ReviewerSummaryIdentity & {
  summarySchemaVersion: 1;
  metrics: ReviewerSummaryMetricsV1;
};

export type ReviewerSummaryV2 = ReviewerSummaryIdentity & {
  summarySchemaVersion: 2;
  metrics: ReviewerSummaryMetricsV2;
};

export type ReviewerSummary = ReviewerSummaryV1 | ReviewerSummaryV2;
