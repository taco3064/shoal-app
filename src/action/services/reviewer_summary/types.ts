import type {
  JudgmentEvent,
  LifecycleEvent,
} from '~app/protocol/services/review_protocol';

export type GitHubUser = {
  id: number;
  login: string;
  type: string;
};

export type GitHubApp = {
  slug: string;
};

export type GitHubComment = {
  id: number;
  body: string;
  createdAt: string;
  author: GitHubUser;
  performedViaGitHubApp: GitHubApp | null;
};

export type GitHubIssue = {
  number: number;
  state: 'open' | 'closed';
  body: string;
  author: GitHubUser;
  comments: GitHubComment[];
};

export type ReviewerNode = {
  id: number;
  owner: GitHubUser;
  fullName: string;
};

export type RequesterNode = {
  id: number;
  owner: GitHubUser;
  parentRepositoryId: number | null;
  isFork: boolean;
};

export type TargetRepository = {
  id: number;
  owner: GitHubUser;
  fullName: string;
  defaultBranch: string;
  currentDefaultBranchHead: string;
  isStarredByReviewer: boolean;
};

export type SummaryResolvers = {
  resolveRequesterNode: (author: GitHubUser) => Promise<RequesterNode | null>;
  resolveTargetRepository: (
    ownerLogin: string,
    repositoryName: string,
  ) => Promise<TargetRepository | null>;
  resolveCurrentReviewPolicyCommit: () => Promise<string>;
  isAllowedLifecycleAutomation: (
    comment: GitHubComment,
    event: LifecycleEvent,
    reviewerNode: ReviewerNode,
  ) => Promise<boolean>;
};

export type SummaryInput = {
  networkRootRepositoryId: number;
  reviewerNode: ReviewerNode;
  issues: GitHubIssue[];
  resolvers: SummaryResolvers;
};

export type ValidRequest = {
  issue: GitHubIssue;
  target: TargetRepository;
};

export type ReviewEvidence
  = | { kind: 'judgment'; value: JudgmentEvent }
    | { kind: 'lifecycle'; value: LifecycleEvent };

export type CanonicalThread = {
  orderedEvidence: ReviewEvidence[];
  evidence: 'admission' | 'manual-judgment';
  issue: GitHubIssue;
  lifecycleEvents: LifecycleEvent[];
  target: TargetRepository | null;
  targetRepositoryId: number;
  currentRequest: ValidRequest | null;
  validJudgments: JudgmentEvent[];
  invalidFormalResultCount: number;
};
