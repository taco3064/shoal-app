import type { GitHubClientOptions } from '~app/action/services/github_client';
import type { ReviewerSummaryV2 } from '~app/protocol/services/reviewer_summary_schema';

export type { ReviewerSummaryV2 as ReviewerSummary };

export type ReviewerSummaryActionOptions = GitHubClientOptions & {
  networkRootRepositoryId: number;
  networkRootRepositoryName: string;
  reviewerNodeRepository: string;
};

export type ReviewerSummaryActionResult = {
  filename: 'reviewer-summary.json';
  json: ReviewerSummaryV2;
  text: string;
};
