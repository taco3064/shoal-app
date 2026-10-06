type InitialReviewEvidence = {
  reviewerNodeId?: unknown;
  targetRepositoryId?: unknown;
};

export function getRecognizableInitialReviewEvidence(
  record: Record<string, unknown>,
): InitialReviewEvidence | null {
  return record.type === 'REVIEWED'
    ? {
        reviewerNodeId: record.reviewerNodeId,
        targetRepositoryId: record.targetRepositoryId,
      }
    : null;
}
