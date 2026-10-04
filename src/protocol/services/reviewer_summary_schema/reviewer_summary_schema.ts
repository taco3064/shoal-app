import {
  currentReviewerSummaryContract,
  isSupportedReviewerSummaryContract,
} from '../network_compatibility';
import type { ReviewerSummaryContract } from '../network_compatibility';
import type {
  ReviewerSummary,
  ReviewerSummaryMetricsV1,
  ReviewerSummaryMetricsV2,
  ReviewerSummaryV2,
} from './types';

export const summarySchemaVersion
  = currentReviewerSummaryContract.summarySchemaVersion;

export function createReviewerSummary(
  repositoryId: number,
  metrics: ReviewerSummaryMetricsV2,
): ReviewerSummaryV2 {
  return {
    metrics: parseV2Metrics(metrics),
    protocolVersion: currentReviewerSummaryContract.protocolVersion,
    reviewerNode: {
      repositoryId: assertPositiveInteger(repositoryId, 'reviewerNode.repositoryId'),
    },
    summarySchemaVersion,
  };
}

export function validateReviewerSummary(
  value: unknown,
  expectedContract: ReviewerSummaryContract = currentReviewerSummaryContract,
): ReviewerSummary {
  if (!isRecord(value)) {
    throw new Error('Reviewer Summary must be a JSON object.');
  }

  if (typeof value.protocolVersion !== 'number') {
    throw new Error('Reviewer Summary protocolVersion is unsupported.');
  }

  if (typeof value.summarySchemaVersion !== 'number') {
    throw new Error('Reviewer Summary summarySchemaVersion is unsupported.');
  }

  if (!isSupportedReviewerSummaryContract(expectedContract)) {
    throw new Error('Trusted Reviewer Summary contract is unsupported.');
  }

  if (
    value.protocolVersion !== expectedContract.protocolVersion
    || value.summarySchemaVersion !== expectedContract.summarySchemaVersion
  ) {
    throw new Error('Reviewer Summary contract does not match trusted workflow.');
  }

  if (!isRecord(value.reviewerNode)) {
    throw new Error('Reviewer Summary reviewerNode must be an object.');
  }

  const reviewerNode = {
    repositoryId: assertPositiveInteger(
      value.reviewerNode.repositoryId,
      'reviewerNode.repositoryId',
    ),
  };

  // Only the trusted binding selects the parser; candidate declarations merely
  // have to match it. Legacy metrics retain their four-field shape.
  if (expectedContract.summarySchemaVersion === 1) {
    return {
      protocolVersion: 1,
      summarySchemaVersion: 1,
      reviewerNode,
      metrics: parseV1Metrics(value.metrics),
    };
  }

  return {
    protocolVersion: 1,
    summarySchemaVersion: 2,
    reviewerNode,
    metrics: parseV2Metrics(value.metrics),
  };
}

export function stringifyReviewerSummary(summary: ReviewerSummaryV2): string {
  const validated = validateReviewerSummary(summary);

  return `${JSON.stringify(validated, null, 2)}\n`;
}

const legacyMetricKeys = [
  'invalidReviewCommentCount',
  'reReviewRequestIssueCount',
  'reviewBackedStarCount',
  'validReviewRequestIssueCount',
];

function parseV1Metrics(value: unknown): ReviewerSummaryMetricsV1 {
  const metrics = assertMetricKeys(value, legacyMetricKeys);

  return assertLegacyMetrics(metrics);
}

function parseV2Metrics(value: unknown): ReviewerSummaryMetricsV2 {
  const metrics = assertMetricKeys(value, [
    ...legacyMetricKeys,
    'pendingReviewRequestCount',
    'completedReviewRequestCount',
  ]);

  const result = {
    ...assertLegacyMetrics(metrics),
    pendingReviewRequestCount: assertNonNegativeInteger(
      metrics.pendingReviewRequestCount,
      'metrics.pendingReviewRequestCount',
    ),
    completedReviewRequestCount: assertNonNegativeInteger(
      metrics.completedReviewRequestCount,
      'metrics.completedReviewRequestCount',
    ),
  };

  if (
    result.pendingReviewRequestCount + result.completedReviewRequestCount
    !== result.validReviewRequestIssueCount
  ) {
    throw new Error('Pending plus completed requests must equal valid review requests.');
  }

  return result;
}

function assertMetricKeys(
  value: unknown,
  expectedKeys: string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Reviewer Summary metrics must be an object.');
  }

  if (Object.keys(value).sort().join('\n') !== [...expectedKeys].sort().join('\n')) {
    throw new Error(
      'Reviewer Summary metrics must contain exactly its schema primitive metrics.',
    );
  }

  return value;
}

function assertLegacyMetrics(metrics: Record<string, unknown>): ReviewerSummaryMetricsV1 {
  const primitiveMetrics = {
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

  assertPrimitiveMetricInvariants(primitiveMetrics);

  return primitiveMetrics;
}

function assertPrimitiveMetricInvariants(metrics: ReviewerSummaryMetricsV1): void {
  if (metrics.reReviewRequestIssueCount > metrics.validReviewRequestIssueCount) {
    throw new Error(
      'metrics.reReviewRequestIssueCount must not exceed '
      + 'metrics.validReviewRequestIssueCount.',
    );
  }

  const initialReviewRequestCount
    = metrics.validReviewRequestIssueCount - metrics.reReviewRequestIssueCount;

  if (metrics.reviewBackedStarCount > initialReviewRequestCount) {
    throw new Error(
      'metrics.reviewBackedStarCount must not exceed initial review requests.',
    );
  }
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
