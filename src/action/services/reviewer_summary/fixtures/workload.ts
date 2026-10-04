import type {
  GitHubComment,
  GitHubIssue,
  SummaryInput,
} from '../types';

export const targetCommit = 'a'.repeat(40);
export const policyCommit = 'b'.repeat(40);
export const changedCommit = 'c'.repeat(40);
export const reviewer = { id: 20, login: 'reviewer', type: 'User' };
export const requester = { id: 30, login: 'requester', type: 'User' };

export function comment(
  id: number,
  payload: Record<string, unknown>,
  options: Partial<GitHubComment> = {},
): GitHubComment {
  return {
    author: reviewer,
    body: `shoal-review-event:v1\n${JSON.stringify(payload)}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
    id,
    performedViaGitHubApp: null,
    ...options,
  };
}

export function judgment(
  id: number,
  overrides: Record<string, unknown> = {},
): GitHubComment {
  return comment(id, {
    actualStarState: true,
    reviewPolicyCommit: policyCommit,
    reviewPolicyPath: 'README.md',
    reviewedAt: '2026-01-01T00:00:00Z',
    reviewerNodeId: 100,
    targetCommit,
    targetDefaultBranch: 'main',
    targetRepositoryFullName: 'requester/project',
    targetRepositoryId: 200,
    type: 'REVIEWED',
    verdict: 'PASS',
    ...overrides,
  });
}

export function trigger(
  id: number,
  requestIssueNumber: number,
  overrides: Record<string, unknown> = {},
): GitHubComment {
  return comment(id, {
    eligibilityTargetCommit: changedCommit,
    reason: 'TARGET_CHANGED',
    requestIssueNumber,
    reviewPolicyCommit: policyCommit,
    reviewerNodeId: 100,
    targetRepositoryId: 200,
    type: 'RE_REVIEW_REQUESTED',
    ...overrides,
  });
}

export function issue(
  number: number,
  comments: GitHubComment[] = [],
  overrides: Partial<GitHubIssue> = {},
): GitHubIssue {
  return {
    author: requester,
    body: '### Repository name\nproject\n\n### Invitation message\n_No response_',
    comments,
    number,
    state: 'open',
    ...overrides,
  };
}

export function admitted(
  comments: GitHubComment[] = [],
  overrides: Partial<GitHubIssue> = {},
): GitHubIssue {
  const admission = comment(1, {}, {
    body: `shoal-review-admission:v1\n${JSON.stringify({
      repositoryName: 'project',
      reviewerNodeId: 100,
      targetRepositoryId: 200,
    })}`,
  });

  return issue(1, [admission, ...comments], overrides);
}

export function input(issues: GitHubIssue[]): SummaryInput {
  return {
    issues,
    networkRootRepositoryId: 10,
    resolvers: {
      isAllowedLifecycleAutomation: async () => false,
      resolveCurrentReviewPolicyCommit: async () => policyCommit,
      resolveRequesterNode: async () => ({
        id: 300,
        isFork: true,
        owner: requester,
        parentRepositoryId: 10,
      }),
      resolveTargetRepository: async () => ({
        currentDefaultBranchHead: targetCommit,
        defaultBranch: 'main',
        fullName: 'requester/project',
        id: 200,
        isStarredByReviewer: true,
        owner: requester,
      }),
    },
    reviewerNode: {
      fullName: 'reviewer/shoal-station',
      id: 100,
      owner: reviewer,
    },
  };
}
