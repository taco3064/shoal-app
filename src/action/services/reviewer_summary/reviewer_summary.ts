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
import {
  getInvalidFormalResultIncrement,
  isJudgmentLifecycleValid,
} from './review_lifecycle';
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

  const currentInitialReviewThreads = canonicalThreads.filter(
    hasCurrentRequest,
  );

  const acceptedReReviewIssues = collectAcceptedReReviewIssues(
    validRequests,
    canonicalThreads,
  );

  return createReviewerSummary(input.reviewerNode.id, {
    invalidReviewCommentCount: countInvalidFormalResults(canonicalThreads),
    reReviewRequestIssueCount: acceptedReReviewIssues.length,
    reviewBackedStarCount: countReviewBackedStars(
      currentInitialReviewThreads,
      currentPolicyCommit,
    ),
    validReviewRequestIssueCount:
      currentInitialReviewThreads.length + acceptedReReviewIssues.length,
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

  const validByIssueNumber = new Map(
    validRequests.map((request) => [request.issue.number, request]),
  );

  for (const issue of input.issues) {
    const admission = findAdmissionEvidence(input, issue);

    if (admission.kind !== 'valid') {
      continue;
    }

    const currentRequest = validByIssueNumber.get(issue.number) ?? null;

    if (
      currentRequest
      && currentRequest.target.id !== admission.value.targetRepositoryId
    ) {
      continue;
    }

    const target = currentRequest?.target
      ?? await resolveAdmittedTarget(input, issue, admission.value);

    const targetRepositoryId = admission.value.targetRepositoryId;

    const reviewEvents = analyzeReviewThread(
      issue,
      input.reviewerNode,
      targetRepositoryId,
    );

    upsertCanonicalThread(byTargetId, {
      currentRequest,
      evidence: 'admission',
      invalidFormalResultCount: reviewEvents.invalidFormalResultCount,
      issue,
      lifecycleEvents: await collectLifecycleEvents(
        input,
        issue,
        targetRepositoryId,
      ),
      target,
      targetRepositoryId,
      validJudgments: reviewEvents.validJudgments,
    });
  }

  for (const request of validRequests) {
    if (byTargetId.has(request.target.id)) {
      continue;
    }

    const admission = findAdmissionEvidence(input, request.issue);

    if (admission.kind !== 'none') {
      continue;
    }

    const reviewEvents = analyzeReviewThread(
      request.issue,
      input.reviewerNode,
      request.target.id,
    );

    const evidence = findManualJudgmentEvidence(
      request,
      reviewEvents.validJudgments,
    );

    if (!evidence) {
      continue;
    }

    upsertCanonicalThread(byTargetId, {
      currentRequest: request,
      evidence,
      invalidFormalResultCount: reviewEvents.invalidFormalResultCount,
      issue: request.issue,
      lifecycleEvents: await collectLifecycleEvents(
        input,
        request.issue,
        request.target.id,
      ),
      target: request.target,
      targetRepositoryId: request.target.id,
      validJudgments: reviewEvents.validJudgments,
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

      if (referencedRequest?.target.id === thread.targetRepositoryId) {
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
      && thread.target
      && latestJudgment.verdict === 'PASS'
      && latestJudgment.targetCommit
      === thread.target.currentDefaultBranchHead
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
  issue: GitHubIssue,
): AdmissionEvidence {
  const records: AdmissionRecord[] = [];

  for (const comment of issue.comments) {
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

  const parsedRequest = parseRequestPayload(issue.body);

  if (
    parsedRequest
    && parsedRequest.repositoryName.toLowerCase()
    !== first.repositoryName.toLowerCase()
  ) {
    return { kind: 'blocked' };
  }

  if (first.reviewerNodeId === input.reviewerNode.id) {
    return { kind: 'valid', value: first };
  }

  return { kind: 'blocked' };
}

function findManualJudgmentEvidence(
  request: ValidRequest,
  judgments: JudgmentEvent[],
): 'manual-judgment' | null {
  if (request.target.owner.id !== request.issue.author.id) {
    return null;
  }

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
  let hasUsableJudgment = false;

  for (const comment of issue.comments) {
    const parsed = parseProtocolComment(comment.body);

    if (
      parsed.kind === 'judgment'
      && comment.author.id === input.reviewerNode.owner.id
      && parsed.value.reviewerNodeId === input.reviewerNode.id
      && parsed.value.targetRepositoryId === targetRepositoryId
      && isJudgmentLifecycleValid(parsed.value, hasUsableJudgment)
    ) {
      hasUsableJudgment = true;

      continue;
    }

    if (parsed.kind !== 'lifecycle') {
      continue;
    }

    if (
      parsed.value.reviewerNodeId !== input.reviewerNode.id
      || parsed.value.targetRepositoryId !== targetRepositoryId
    ) {
      continue;
    }

    if (!hasUsableJudgment) {
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

function analyzeReviewThread(
  issue: GitHubIssue,
  reviewerNode: ReviewerNode,
  targetRepositoryId: number,
): { validJudgments: JudgmentEvent[]; invalidFormalResultCount: number } {
  const validJudgments: JudgmentEvent[] = [];
  let hasUsableJudgment = false;
  let invalidFormalResultCount = 0;

  for (const comment of issue.comments) {
    const parsed = parseProtocolComment(comment.body);

    if (parsed.kind === 'invalid-formal-result') {
      invalidFormalResultCount += getInvalidFormalResultIncrement(issue);

      continue;
    }

    if (parsed.kind !== 'judgment') {
      continue;
    }

    if (
      comment.author.id !== reviewerNode.owner.id
      || parsed.value.reviewerNodeId !== reviewerNode.id
      || parsed.value.targetRepositoryId !== targetRepositoryId
      || !isJudgmentLifecycleValid(parsed.value, hasUsableJudgment)
    ) {
      invalidFormalResultCount += getInvalidFormalResultIncrement(issue);

      continue;
    }

    validJudgments.push(parsed.value);
    hasUsableJudgment = true;
  }

  return { invalidFormalResultCount, validJudgments };
}

function getLatestJudgment(judgments: JudgmentEvent[]): JudgmentEvent | null {
  return judgments.at(-1) ?? null;
}

async function resolveAdmittedTarget(
  input: SummaryInput,
  issue: GitHubIssue,
  admission: AdmissionRecord,
) {
  const target = await input.resolvers.resolveTargetRepository(
    issue.author.login,
    admission.repositoryName,
  );

  return target?.id === admission.targetRepositoryId ? target : null;
}

function upsertCanonicalThread(
  byTargetId: Map<number, CanonicalThread>,
  thread: CanonicalThread,
): void {
  const existing = byTargetId.get(thread.targetRepositoryId);

  if (existing && existing.issue.number < thread.issue.number) {
    return;
  }

  byTargetId.set(thread.targetRepositoryId, thread);
}

function hasCurrentRequest(
  thread: CanonicalThread,
): thread is CanonicalThread & { currentRequest: ValidRequest } {
  return Boolean(thread.currentRequest);
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
