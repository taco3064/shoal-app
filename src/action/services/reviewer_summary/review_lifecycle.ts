import type {
  AdmissionRecord,
  JudgmentEvent,
  ParsedProtocolComment,
} from '~app/protocol/services/review_protocol';
import { parseRequestPayload } from '~app/protocol/services/review_protocol';
import type {
  CanonicalThread,
  GitHubComment,
  GitHubIssue,
  ReviewerNode,
  ValidRequest,
} from './types';

export function countInvalidFormalResults(threads: CanonicalThread[]): number {
  return threads.reduce(
    (count, thread) => count + thread.invalidFormalResultCount,
    0,
  );
}

export function getCurrentAdmittedRequest(
  request: ValidRequest | undefined,
  admission: AdmissionRecord,
): ValidRequest | null {
  const parsed = request && parseRequestPayload(request.issue.body);

  return request
    && request.target.id === admission.targetRepositoryId
    && parsed?.repositoryName.toLowerCase()
    === admission.repositoryName.toLowerCase()
    ? request
    : null;
}

export function getInvalidFormalResultIncrement(issue: GitHubIssue): number {
  return issue.state === 'closed' ? 1 : 0;
}

export function isJudgmentLifecycleValid(
  judgment: JudgmentEvent,
  hasPriorFormalJudgmentEvidence: boolean,
): boolean {
  return hasPriorFormalJudgmentEvidence
    ? judgment.type !== 'REVIEWED'
    : judgment.type === 'REVIEWED';
}

export function isPriorFormalJudgmentEvidence(
  parsed: ParsedProtocolComment,
  comment: GitHubComment,
  reviewerNode: ReviewerNode,
  targetRepositoryId: number,
): boolean {
  if (comment.author.id !== reviewerNode.owner.id) {
    return false;
  }

  if (parsed.kind === 'invalid-formal-result') {
    return true;
  }

  return parsed.kind === 'judgment'
    && parsed.value.reviewerNodeId === reviewerNode.id
    && parsed.value.targetRepositoryId === targetRepositoryId;
}
