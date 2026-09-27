import type { GitHubClientOptions } from '~app/action/services/github_client';
import type { ReviewerSummary } from '~app/protocol/services/reviewer_summary_schema';

export type { ReviewerSummary };

export type ReviewerSummaryActionOptions = GitHubClientOptions & {
  networkRootRepositoryId: number;
  networkRootRepositoryName: string;
  reviewerNodeRepository: string;
};

export type ReviewerSummaryActionResult = {
  filename: 'reviewer-summary.json';
  json: ReviewerSummary;
  text: string;
};
