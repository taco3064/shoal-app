import type { JudgmentEvent } from '~app/protocol/services/review_protocol';
import type { GitHubIssue } from './types';

export function getInvalidFormalResultIncrement(issue: GitHubIssue): number {
  return issue.state === 'closed' ? 1 : 0;
}

export function isJudgmentLifecycleValid(
  judgment: JudgmentEvent,
  hasUsableJudgment: boolean,
): boolean {
  return hasUsableJudgment
    ? judgment.type !== 'REVIEWED'
    : judgment.type === 'REVIEWED';
}
