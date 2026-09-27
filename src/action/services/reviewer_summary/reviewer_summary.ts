import {
  parseProtocolComment,
  parseRequestPayload,
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
  const canonicalThreads = collectCanonicalThreads(input, validRequests);

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

    validRequests.push({ issue, target });
  }

  return validRequests;
}

function collectCanonicalThreads(
  input: SummaryInput,
  validRequests: ValidRequest[],
): CanonicalThread[] {
  const byTargetId = new Map<number, CanonicalThread>();

  for (const request of validRequests) {
    const admission = findValidAdmission(input, request);

    if (!admission) {
      continue;
    }

    const existing = byTargetId.get(request.target.id);

    if (existing && existing.issue.number < request.issue.number) {
      continue;
    }

    byTargetId.set(request.target.id, {
      ...request,
      admissionTargetRepositoryId: admission.targetRepositoryId,
      invalidFormalResultCount: countInvalidFormalResultComments(
        request.issue,
        input.reviewerNode,
      ),
      lifecycleEvents: collectLifecycleEvents(
        request.issue,
        input.reviewerNode,
        request.target.id,
      ),
      validJudgments: collectValidJudgments(
        request.issue,
        input.reviewerNode,
        request.target.id,
      ),
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
      if (validByIssueNumber.has(event.requestIssueNumber)) {
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

function findValidAdmission(input: SummaryInput, request: ValidRequest) {
  for (const comment of request.issue.comments) {
    if (comment.author.id !== input.reviewerNode.owner.id) {
      continue;
    }

    const parsed = parseProtocolComment(comment.body);

    if (parsed.kind !== 'admission') {
      continue;
    }

    if (
      parsed.value.reviewerNodeId === input.reviewerNode.id
      && parsed.value.targetRepositoryId === request.target.id
      && parseRequestPayload(request.issue.body)?.repositoryName
      === parsed.value.repositoryName
    ) {
      return parsed.value;
    }
  }

  return null;
}

function collectLifecycleEvents(
  issue: GitHubIssue,
  reviewerNode: ReviewerNode,
  targetRepositoryId: number,
): LifecycleEvent[] {
  return issue.comments.flatMap((comment) => {
    const parsed = parseProtocolComment(comment.body);

    if (
      parsed.kind !== 'lifecycle'
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
): number {
  if (issue.state !== 'closed') {
    return 0;
  }

  return issue.comments.filter((comment) => {
    const parsed = parseProtocolComment(comment.body);

    return (
      parsed.kind === 'invalid-formal-result'
      && comment.author.id === reviewerNode.owner.id
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
