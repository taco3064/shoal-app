import { getProtocolVersion } from '../review_protocol';

export const summarySchemaVersion = 1;

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

export function createReviewerSummary(
  repositoryId: number,
  metrics: ReviewerSummaryMetrics,
): ReviewerSummary {
  return {
    metrics: assertPrimitiveMetrics(metrics),
    protocolVersion: getProtocolVersion(),
    reviewerNode: {
      repositoryId: assertPositiveInteger(
        repositoryId,
        'reviewerNode.repositoryId',
      ),
    },
    summarySchemaVersion,
  };
}

export function validateReviewerSummary(value: unknown): ReviewerSummary {
  if (!isRecord(value)) {
    throw new Error('Reviewer Summary must be a JSON object.');
  }

  if (value.protocolVersion !== getProtocolVersion()) {
    throw new Error('Reviewer Summary protocolVersion is unsupported.');
  }

  if (value.summarySchemaVersion !== summarySchemaVersion) {
    throw new Error('Reviewer Summary summarySchemaVersion is unsupported.');
  }

  if (!isRecord(value.reviewerNode)) {
    throw new Error('Reviewer Summary reviewerNode must be an object.');
  }

  return createReviewerSummary(
    assertPositiveInteger(
      value.reviewerNode.repositoryId,
      'reviewerNode.repositoryId',
    ),
    parseMetrics(value.metrics),
  );
}

export function stringifyReviewerSummary(summary: ReviewerSummary): string {
  const validated = validateReviewerSummary(summary);

  return `${JSON.stringify(validated, null, 2)}\n`;
}

function parseMetrics(value: unknown): ReviewerSummaryMetrics {
  if (!isRecord(value)) {
    throw new Error('Reviewer Summary metrics must be an object.');
  }

  const keys = Object.keys(value).sort();

  const expectedKeys = [
    'invalidReviewCommentCount',
    'reReviewRequestIssueCount',
    'reviewBackedStarCount',
    'validReviewRequestIssueCount',
  ];

  if (keys.join('\n') !== expectedKeys.join('\n')) {
    throw new Error(
      'Reviewer Summary metrics must contain exactly the primitive MVP metrics.',
    );
  }

  return assertPrimitiveMetrics({
    invalidReviewCommentCount: value.invalidReviewCommentCount,
    reReviewRequestIssueCount: value.reReviewRequestIssueCount,
    reviewBackedStarCount: value.reviewBackedStarCount,
    validReviewRequestIssueCount: value.validReviewRequestIssueCount,
  });
}

function assertPrimitiveMetrics(
  metrics: Record<keyof ReviewerSummaryMetrics, unknown>,
): ReviewerSummaryMetrics {
  return {
    invalidReviewCommentCount: assertNonNegativeInteger(
      metrics.invalidReviewCommentCount,
      'metrics.invalidReviewCommentCount',
    ),
    reReviewRequestIssueCount: assertNonNegativeInteger(
      metrics.reReviewRequestIssueCount,
      'metrics.reReviewRequestIssueCount',
    ),
    reviewBackedStarCount: assertNonNegativeInteger(
      metrics.reviewBackedStarCount,
      'metrics.reviewBackedStarCount',
    ),
    validReviewRequestIssueCount: assertNonNegativeInteger(
      metrics.validReviewRequestIssueCount,
      'metrics.validReviewRequestIssueCount',
    ),
  };
}

function assertPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return Number(value);
}

function assertNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }

  return Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
