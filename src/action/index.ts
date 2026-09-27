import {
  GitHubClient,
  type GitHubClientOptions,
} from '~app/action/services/github_client';
import { computeReviewerSummary } from '~app/action/services/reviewer_summary';
import {
  stringifyReviewerSummary,
  type ReviewerSummary,
} from '~app/protocol/services/reviewer_summary_schema';

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

export async function runReviewerSummaryAction(
  options: ReviewerSummaryActionOptions,
): Promise<ReviewerSummaryActionResult> {
  const client = new GitHubClient(options);

  const reviewerNode = await client.getReviewerNode(
    options.reviewerNodeRepository,
  );

  const issues = await client.listIssuesWithComments(
    options.reviewerNodeRepository,
  );

  const summary = await computeReviewerSummary({
    issues,
    networkRootRepositoryId: options.networkRootRepositoryId,
    resolvers: client.createResolvers({
      networkRootRepositoryId: options.networkRootRepositoryId,
      networkRootRepositoryName: options.networkRootRepositoryName,
      reviewerLogin: reviewerNode.owner.login,
      reviewerNodeFullName: reviewerNode.fullName,
    }),
    reviewerNode,
  });

  return {
    filename: 'reviewer-summary.json',
    json: summary,
    text: stringifyReviewerSummary(summary),
  };
}

export {
  GitHubClient,
  GitHubReadError,
} from '~app/action/services/github_client';
export type { ReviewerSummary } from '~app/protocol/services/reviewer_summary_schema';
