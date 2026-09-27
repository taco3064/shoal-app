type ReviewProtocol = typeof import('./contract').reviewProtocol;

export type RequestPayload = {
  repositoryName: string;
  invitationMessage: string | null;
};

export type AdmissionRecord = {
  reviewerNodeId: number;
  targetRepositoryId: number;
  repositoryName: string;
};

export type ReReviewReason
  = 'TARGET_CHANGED' | 'POLICY_CHANGED' | 'TARGET_AND_POLICY_CHANGED';
export type ReviewVerdict = 'PASS' | 'FAIL';
export type JudgmentType
  = 'REVIEWED' | 'RE_REVIEWED' | 'STAR_REVOKED' | 'REVOKED_EXTERNALLY';

export type LifecycleEvent = {
  type: ReviewProtocol['event']['lifecycleType'];
  reviewerNodeId: number;
  targetRepositoryId: number;
  requestIssueNumber: number;
  eligibilityTargetCommit: string;
  reviewPolicyCommit: string;
  reason: ReReviewReason;
};

export type JudgmentEvent = {
  type: JudgmentType;
  reviewerNodeId: number;
  targetRepositoryId: number;
  targetRepositoryFullName: string;
  targetDefaultBranch: string;
  targetCommit: string;
  reviewPolicyPath: ReviewProtocol['event']['policyPath'];
  reviewPolicyCommit: string;
  verdict: ReviewVerdict;
  actualStarState: boolean;
  reviewedAt: string;
};

export type ParsedProtocolComment
  = | { kind: 'none' }
    | { kind: 'admission'; value: AdmissionRecord }
    | { kind: 'lifecycle'; value: LifecycleEvent }
    | { kind: 'judgment'; value: JudgmentEvent }
    | { kind: 'invalid-formal-result' };
