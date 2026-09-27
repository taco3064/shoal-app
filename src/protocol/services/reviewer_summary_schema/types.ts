export type ReviewerSummaryMetrics = {
  reviewBackedStarCount: number;
  validReviewRequestIssueCount: number;
  reReviewRequestIssueCount: number;
  invalidReviewCommentCount: number;
};

export type ReviewerSummary = {
  protocolVersion: number;
  summarySchemaVersion: number;
  reviewerNode: {
    repositoryId: number;
  };
  metrics: ReviewerSummaryMetrics;
};
