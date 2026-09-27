import {
  parseProtocolComment,
  parseRequestPayload,
  type AdmissionRecord,
  type JudgmentEvent,
  type LifecycleEvent,
} from '~app/protocol/services/review_protocol';
import {
  createReviewerSummary,
  type ReviewerSummary,
} from '~app/protocol/services/reviewer_summary_schema';
import type {
  CanonicalThread,
  GitHubIssue,
  GitHubUser,
  RequesterNode,
  ReviewerNode,
  SummaryInput,
  ValidRequest,
} from './types';

export async function computeReviewerSummary(
  input: SummaryInput,
): Promise<ReviewerSummary> {
  const currentPolicyCommit
    = await input.resolvers.resolveCurrentReviewPolicyCommit();

  const validRequests = await collectValidRequests(input);
  const canonicalThreads = await collectCanonicalThreads(input, validRequests);

  const acceptedReReviewIssues = collectAcceptedReReviewIssues(
    validRequests,
    canonicalThreads,
  );

  return createReviewerSummary(input.reviewerNode.id, {
    invalidReviewCommentCount: countInvalidFormalResults(canonicalThreads),
    reReviewRequestIssueCount: acceptedReReviewIssues.length,
    reviewBackedStarCount: countReviewBackedStars(
      canonicalThreads,
      currentPolicyCommit,
    ),
    validReviewRequestIssueCount:
      canonicalThreads.length + acceptedReReviewIssues.length,
  });
}

async function collectValidRequests(
  input: SummaryInput,
): Promise<ValidRequest[]> {
  const validRequests: ValidRequest[] = [];

  for (const issue of input.issues) {
    const request = parseRequestPayload(issue.body);

    if (!request) {
      continue;
    }

    const requesterNode = await input.resolvers.resolveRequesterNode(
      issue.author,
    );

    if (
      !isValidRequesterNode(
        requesterNode,
        issue.author,
        input.networkRootRepositoryId,
      )
    ) {
      continue;
    }

    const target = await input.resolvers.resolveTargetRepository(
      issue.author.login,
      request.repositoryName,
    );

    if (!target) {
      continue;
    }

    if (target.owner.id === input.reviewerNode.owner.id) {
      continue;
    }

    validRequests.push({ issue, target });
  }

  return validRequests;
}

async function collectCanonicalThreads(
  input: SummaryInput,
  validRequests: ValidRequest[],
): Promise<CanonicalThread[]> {
  const byTargetId = new Map<number, CanonicalThread>();

  for (const request of validRequests) {
    const admission = findAdmissionEvidence(input, request);

    const validJudgments = collectValidJudgments(
      request.issue,
      input.reviewerNode,
      request.target.id,
    );

    if (admission.kind === 'blocked') {
      continue;
    }

    const evidence = admission.kind === 'valid'
      ? 'admission'
      : findManualJudgmentEvidence(request, validJudgments);

    if (!evidence) {
      continue;
    }

    const existing = byTargetId.get(request.target.id);

    if (existing && existing.issue.number < request.issue.number) {
      continue;
    }

    byTargetId.set(request.target.id, {
      ...request,
      evidence,
      invalidFormalResultCount: countInvalidFormalResultComments(
        request.issue,
        input.reviewerNode,
        request.target.id,
      ),
      lifecycleEvents: await collectLifecycleEvents(
        input,
        request.issue,
        request.target.id,
      ),
      validJudgments,
    });
  }

  return [...byTargetId.values()].sort(
    (left, right) => left.issue.number - right.issue.number,
  );
}

function collectAcceptedReReviewIssues(
  validRequests: ValidRequest[],
  canonicalThreads: CanonicalThread[],
): ValidRequest[] {
  const validByIssueNumber = new Map(
    validRequests.map((request) => [request.issue.number, request]),
  );

  const acceptedIssueNumbers = new Set<number>();

  for (const thread of canonicalThreads) {
    for (const event of thread.lifecycleEvents) {
      if (event.type !== 'RE_REVIEW_REQUESTED') {
        continue;
      }

      const referencedRequest = validByIssueNumber.get(
        event.requestIssueNumber,
      );

      if (referencedRequest?.target.id === thread.target.id) {
        acceptedIssueNumbers.add(event.requestIssueNumber);
      }
    }
  }

  return [...acceptedIssueNumbers]
    .map((issueNumber) => validByIssueNumber.get(issueNumber))
    .filter((request): request is ValidRequest => Boolean(request))
    .filter(
      (request) =>
        !canonicalThreads.some(
          (thread) => thread.issue.number === request.issue.number,
        ),
    );
}

function countReviewBackedStars(
  threads: CanonicalThread[],
  currentPolicyCommit: string,
): number {
  return threads.filter((thread) => {
    const latestJudgment = getLatestJudgment(thread.validJudgments);

    return Boolean(
      latestJudgment
      && latestJudgment.verdict === 'PASS'
      && latestJudgment.targetCommit === thread.target.currentDefaultBranchHead
      && latestJudgment.reviewPolicyCommit === currentPolicyCommit
      && thread.target.isStarredByReviewer,
    );
  }).length;
}

function countInvalidFormalResults(threads: CanonicalThread[]): number {
  return threads.reduce(
    (count, thread) => count + thread.invalidFormalResultCount,
    0,
  );
}

type AdmissionEvidence
  = | { kind: 'none' }
    | { kind: 'valid'; value: AdmissionRecord }
    | { kind: 'blocked' };

function findAdmissionEvidence(
  input: SummaryInput,
  request: ValidRequest,
): AdmissionEvidence {
  const records: AdmissionRecord[] = [];

  for (const comment of request.issue.comments) {
    if (comment.author.id !== input.reviewerNode.owner.id) {
      continue;
    }

    const parsed = parseProtocolComment(comment.body);

    if (parsed.kind !== 'admission') {
      continue;
    }

    records.push(parsed.value);
  }

  if (records.length === 0) {
    return { kind: 'none' };
  }

  const [first] = records;

  if (
    records.some(
      (record) =>
        record.reviewerNodeId !== first.reviewerNodeId
        || record.targetRepositoryId !== first.targetRepositoryId
        || record.repositoryName.toLowerCase()
        !== first.repositoryName.toLowerCase(),
    )
  ) {
    return { kind: 'blocked' };
  }

  if (
    first.reviewerNodeId === input.reviewerNode.id
    && first.targetRepositoryId === request.target.id
  ) {
    return { kind: 'valid', value: first };
  }

  return { kind: 'blocked' };
}

function findManualJudgmentEvidence(
  request: ValidRequest,
  judgments: JudgmentEvent[],
): 'manual-judgment' | null {
  return judgments.some(
    (judgment) => judgment.targetRepositoryId === request.target.id,
  )
    ? 'manual-judgment'
    : null;
}

async function collectLifecycleEvents(
  input: SummaryInput,
  issue: GitHubIssue,
  targetRepositoryId: number,
): Promise<LifecycleEvent[]> {
  const events: LifecycleEvent[] = [];

  for (const comment of issue.comments) {
    const parsed = parseProtocolComment(comment.body);

    if (parsed.kind !== 'lifecycle') {
      continue;
    }

    if (
      parsed.value.reviewerNodeId !== input.reviewerNode.id
      || parsed.value.targetRepositoryId !== targetRepositoryId
    ) {
      continue;
    }

    if (comment.author.id === input.reviewerNode.owner.id) {
      events.push(parsed.value);

      continue;
    }

    if (
      await input.resolvers.isAllowedLifecycleAutomation(
        comment,
        parsed.value,
        input.reviewerNode,
      )
    ) {
      events.push(parsed.value);
    }
  }

  return events;
}

function collectValidJudgments(
  issue: GitHubIssue,
  reviewerNode: ReviewerNode,
  targetRepositoryId: number,
): JudgmentEvent[] {
  return issue.comments.flatMap((comment) => {
    const parsed = parseProtocolComment(comment.body);

    if (
      parsed.kind !== 'judgment'
      || comment.author.id !== reviewerNode.owner.id
    ) {
      return [];
    }

    if (
      parsed.value.reviewerNodeId !== reviewerNode.id
      || parsed.value.targetRepositoryId !== targetRepositoryId
    ) {
      return [];
    }

    return [parsed.value];
  });
}

function countInvalidFormalResultComments(
  issue: GitHubIssue,
  reviewerNode: ReviewerNode,
  targetRepositoryId: number,
): number {
  if (issue.state !== 'closed') {
    return 0;
  }

  return issue.comments.filter((comment) => {
    const parsed = parseProtocolComment(comment.body);

    if (parsed.kind === 'invalid-formal-result') {
      return true;
    }

    if (parsed.kind !== 'judgment') {
      return false;
    }

    return (
      comment.author.id !== reviewerNode.owner.id
      || parsed.value.reviewerNodeId !== reviewerNode.id
      || parsed.value.targetRepositoryId !== targetRepositoryId
    );
  }).length;
}

function getLatestJudgment(judgments: JudgmentEvent[]): JudgmentEvent | null {
  return judgments.at(-1) ?? null;
}

function isValidRequesterNode(
  requesterNode: RequesterNode | null,
  author: GitHubUser,
  networkRootRepositoryId: number,
): requesterNode is RequesterNode {
  return Boolean(
    requesterNode
    && requesterNode.isFork
    && requesterNode.owner.type === 'User'
    && requesterNode.owner.id === author.id
    && requesterNode.parentRepositoryId === networkRootRepositoryId,
  );
}
