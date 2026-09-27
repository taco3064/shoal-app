export type ReviewProtocolContract = {
  protocolVersion: string;
  request: {
    repositoryHeading: string;
    invitationHeading: string;
    emptyInvitation: string;
  };
  event: {
    marker: string;
    policyPath: string;
    lifecycleType: string;
    judgmentTypes: JudgmentType[];
    requiredLifecycleFields: string[];
    requiredJudgmentFields: string[];
  };
  admission: {
    marker: string;
    requiredFields: string[];
  };
};

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

export type LifecycleType
  = 'RE_REVIEW_REQUESTED' | 'STALE_DETECTED' | 'ENDORSEMENT_DRIFT';

export type AutomationProvenance = {
  actorLogin: string;
  repositoryId: number;
  workflowPath: string;
  workflowCommit: string;
};

export type LifecycleEvent = {
  type: LifecycleType;
  reviewerNodeId: number;
  targetRepositoryId: number;
  requestIssueNumber: number;
  eligibilityTargetCommit: string;
  reviewPolicyCommit: string;
  reason: ReReviewReason;
  automationProvenance: AutomationProvenance | null;
};

export type JudgmentEvent = {
  type: JudgmentType;
  reviewerNodeId: number;
  targetRepositoryId: number;
  targetRepositoryFullName: string;
  targetDefaultBranch: string;
  targetCommit: string;
  reviewPolicyPath: string;
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
