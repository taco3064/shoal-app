import type { JudgmentEvent } from '~app/protocol/services/review_protocol';
import type { CanonicalThread, ValidRequest } from './types';

export function countCompletedWork(
  threads: CanonicalThread[],
  acceptedRequests: ValidRequest[],
  currentPolicyCommit: string,
): number {
  const acceptedByNumber = new Map(acceptedRequests.map((request) =>
    [request.issue.number, request.target.id]));

  const completedTriggers = new Set<number>();
  let completedInitial = 0;

  for (const thread of threads) {
    if (thread.currentRequest
      && thread.validJudgments.some((judgment) => judgment.type === 'REVIEWED')) {
      completedInitial += 1;
    }

    const unmatched = new Set<number>();
    let previousJudgment: JudgmentEvent | null = null;

    for (const evidence of thread.orderedEvidence) {
      if (evidence.kind === 'judgment') {
        for (const issueNumber of unmatched) {
          completedTriggers.add(issueNumber);
        }

        unmatched.clear();
        previousJudgment = evidence.value;
      } else if (evidence.value.type === 'RE_REVIEW_REQUESTED'
        && acceptedByNumber.get(evidence.value.requestIssueNumber)
        === thread.targetRepositoryId) {
        unmatched.add(evidence.value.requestIssueNumber);
      }
    }

    if (thread.issue.state === 'closed' && previousJudgment
      && thread.target?.currentDefaultBranchHead === previousJudgment.targetCommit
      && currentPolicyCommit === previousJudgment.reviewPolicyCommit) {
      for (const issueNumber of unmatched) {
        completedTriggers.add(issueNumber);
      }
    }
  }

  return completedInitial + completedTriggers.size;
}
