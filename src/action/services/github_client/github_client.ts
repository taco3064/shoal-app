import type {
  GitHubComment,
  GitHubIssue,
  GitHubUser,
  RequesterNode,
  ReviewerNode,
  SummaryResolvers,
} from '../reviewer_summary';
import { isValidRequesterNode } from '../reviewer_summary';
import { reviewProtocol } from '~app/protocol/services/review_protocol';
import type { AutomationProvenance } from '~app/protocol/services/review_protocol';
import type {
  FetchLike,
  GitHubClientOptions,
  RepositoryResponse,
  WorkflowRunResponse,
} from './types';
import {
  isCommentResponse,
  isCommitResponse,
  isIssueListResponse,
  isIssueResponse,
  isRecord,
  isRepositoryResponse,
  isWorkflowRunResponse,
  parseNextLink,
  toComment,
  toRequesterNode,
  toUser,
} from './github_api_response';

export class GitHubReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubReadError';
  }
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly token: string | null;

  constructor(options: GitHubClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.fetcher = options.fetch ?? fetch;
    this.token = options.token ?? null;
  }

  async getReviewerNode(repositoryFullName: string): Promise<ReviewerNode> {
    const repository = await this.getRepository(repositoryFullName);

    return {
      fullName: repository.full_name,
      id: repository.id,
      owner: toUser(repository.owner),
    };
  }

  async listIssuesWithComments(
    repositoryFullName: string,
  ): Promise<GitHubIssue[]> {
    const issues = await this.paginate(
      `/repos/${repositoryFullName}/issues?state=all&per_page=100`,
      isIssueListResponse,
    );

    const issueItems = issues.filter(isIssueResponse);
    const result: GitHubIssue[] = [];

    for (const issue of issueItems) {
      const comments = await this.paginate(
        `/repos/${repositoryFullName}/issues/${issue.number}/comments?per_page=100`,
        isCommentResponse,
      );

      result.push({
        author: toUser(issue.user),
        body: issue.body ?? '',
        comments: comments.map(toComment),
        number: issue.number,
        state: issue.state === 'closed' ? 'closed' : 'open',
      });
    }

    return result;
  }

  createResolvers(options: {
    networkRootRepositoryId: number;
    networkRootRepositoryName: string;
    reviewerLogin: string;
    reviewerNodeFullName: string;
  }): SummaryResolvers {
    return {
      resolveCurrentReviewPolicyCommit: () =>
        this.getLatestPathCommit(options.reviewerNodeFullName, 'README.md'),
      isAllowedLifecycleAutomation: async (comment, event, reviewerNode) => {
        const provenance = event.automationProvenance;

        if (
          !provenance
          || !isAllowedAutomationActor(comment)
          || !reviewProtocol.event.automation.allowedWorkflowPaths.includes(
            provenance.workflowPath,
          )
        ) {
          return false;
        }

        if (
          provenance.actorLogin !== comment.author.login
          || provenance.repositoryId !== reviewerNode.id
        ) {
          return false;
        }

        const workflowRun = await this.getWorkflowRunAttemptOrNull(
          reviewerNode.fullName,
          provenance.workflowRunId,
          provenance.workflowRunAttempt,
        );

        if (!workflowRun) {
          return false;
        }

        return isWorkflowRunProvenance({
          comment,
          provenance,
          reviewerNode,
          workflowRun,
        });
      },
      resolveRequesterNode: (author) =>
        this.resolveRequesterNode(
          author,
          options.networkRootRepositoryId,
          options.networkRootRepositoryName,
        ),
      resolveTargetRepository: async (ownerLogin, repositoryName) => {
        const target = await this.getRepositoryOrNull(
          `${ownerLogin}/${repositoryName}`,
        );

        if (!target) {
          return null;
        }

        const currentDefaultBranchHead = await this.getBranchHead(
          target.full_name,
          target.default_branch,
        );

        const isStarredByReviewer = await this.isRepositoryStarredBy(
          target.id,
          options.reviewerLogin,
        );

        return {
          currentDefaultBranchHead,
          defaultBranch: target.default_branch,
          fullName: target.full_name,
          id: target.id,
          isStarredByReviewer,
          owner: toUser(target.owner),
        };
      },
    };
  }

  async resolveRequesterNode(
    author: GitHubUser,
    networkRootRepositoryId: number,
    networkRootRepositoryName: string,
  ): Promise<RequesterNode | null> {
    const directNameCandidate = await this.getRepositoryOrNull(
      `${author.login}/${networkRootRepositoryName}`,
    );

    const directNode = directNameCandidate && toRequesterNode(directNameCandidate);

    if (isValidRequesterNode(directNode, author, networkRootRepositoryId)) {
      return directNode;
    }

    const repositories = await this.paginate(
      `/users/${author.login}/repos?type=owner&per_page=100`,
      isRepositoryResponse,
    );

    for (const item of repositories) {
      if (!item.fork && item.id !== networkRootRepositoryId) {
        continue;
      }

      const repository = await this.getRepositoryOrNull(item.full_name);

      const node = repository && toRequesterNode(repository);

      if (isValidRequesterNode(node, author, networkRootRepositoryId)) {
        return node;
      }
    }

    return null;
  }

  async getRepository(fullName: string): Promise<RepositoryResponse> {
    const value = await this.get(`/repos/${fullName}`);

    if (!isRepositoryResponse(value)) {
      throw new GitHubReadError(
        `GitHub repository response for ${fullName} was malformed.`,
      );
    }

    return value;
  }

  async getRepositoryOrNull(
    fullName: string,
  ): Promise<RepositoryResponse | null> {
    try {
      return await this.getRepository(fullName);
    } catch (error) {
      if (error instanceof GitHubReadError && error.message.includes('404')) {
        return null;
      }

      throw error;
    }
  }

  async getBranchHead(fullName: string, branch: string): Promise<string> {
    const value = await this.get(
      `/repos/${fullName}/branches/${encodeURIComponent(branch)}`,
    );

    if (
      !isRecord(value)
      || !isRecord(value.commit)
      || typeof value.commit.sha !== 'string'
    ) {
      throw new GitHubReadError(
        `GitHub branch response for ${fullName}@${branch} was malformed.`,
      );
    }

    return value.commit.sha;
  }

  async getLatestPathCommit(fullName: string, path: string): Promise<string> {
    const encodedPath = encodeURIComponent(path);

    const commits = await this.paginate(
      `/repos/${fullName}/commits?path=${encodedPath}&per_page=1`,
      isCommitResponse,
    );

    const first = commits[0];

    if (!first) {
      throw new GitHubReadError(`No commit found for ${fullName}:${path}.`);
    }

    return first.sha;
  }

  async getWorkflowRunAttemptOrNull(
    fullName: string,
    runId: number,
    attemptNumber: number,
  ): Promise<WorkflowRunResponse | null> {
    const path
      = `/repos/${fullName}/actions/runs/${runId}`
        + `/attempts/${attemptNumber}`;

    let value: unknown;

    try {
      value = await this.get(path);
    } catch (error) {
      if (error instanceof GitHubReadError && error.message.includes('404')) {
        return null;
      }

      throw error;
    }

    if (!isWorkflowRunResponse(value)) {
      throw new GitHubReadError(
        `GitHub workflow run attempt response for ${fullName}#${runId}.`
        + `${attemptNumber} was malformed.`,
      );
    }

    return value;
  }

  async isRepositoryStarredBy(
    repositoryId: number,
    login: string,
  ): Promise<boolean> {
    const starredRepositories = await this.paginate(
      `/users/${encodeURIComponent(login)}/starred?per_page=100`,
      isRepositoryResponse,
    );

    return starredRepositories.some((repository) => repository.id === repositoryId);
  }

  async paginate<T>(
    path: string,
    isItem: (value: unknown) => value is T,
  ): Promise<T[]> {
    const firstUrl = new URL(`${this.baseUrl}${path}`);

    firstUrl.searchParams.set('per_page', '100');
    const items: T[] = [];
    let nextUrl: string | null = firstUrl.toString();

    while (nextUrl) {
      const response = await this.request(nextUrl);

      if (!Array.isArray(response.body)) {
        throw new GitHubReadError(
          `GitHub paginated response for ${nextUrl} was not an array.`,
        );
      }

      for (const item of response.body) {
        if (!isItem(item)) {
          throw new GitHubReadError(
            `GitHub paginated response for ${nextUrl} contained a malformed item.`,
          );
        }
      }

      items.push(...response.body);
      nextUrl = parseNextLink(response.linkHeader);
    }

    return items;
  }

  private async get(path: string): Promise<unknown> {
    return (await this.request(`${this.baseUrl}${path}`)).body;
  }

  private async request(
    url: string,
  ): Promise<{ body: unknown; linkHeader: string | null }> {
    const response = await this.fetcher(url, { headers: this.headers() });

    if (!response.ok) {
      throw new GitHubReadError(
        `GitHub read failed with ${response.status} for ${url}.`,
      );
    }

    return {
      body: await response.json(),
      linkHeader: response.headers.get('link'),
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }
}

function isAllowedAutomationActor(comment: GitHubComment): boolean {
  return reviewProtocol.event.automation.allowedActors.some(
    (actor) =>
      comment.author.login === actor.login
      && comment.author.type === actor.type
      && comment.performedViaGitHubApp?.slug === actor.appSlug,
  );
}

function isWorkflowRunProvenance(options: {
  comment: GitHubComment;
  provenance: AutomationProvenance;
  reviewerNode: ReviewerNode;
  workflowRun: WorkflowRunResponse;
}): boolean {
  const { comment, provenance, reviewerNode, workflowRun } = options;

  return Boolean(
    workflowRun.id === provenance.workflowRunId
    && workflowRun.run_attempt === provenance.workflowRunAttempt
    && workflowRun.path === provenance.workflowPath
    && workflowRun.head_sha === provenance.workflowCommit
    && workflowRun.repository.id === reviewerNode.id
    && (
      !workflowRun.head_repository
      || workflowRun.head_repository.id === reviewerNode.id
    )
    && isCommentWithinWorkflowRun(comment.createdAt, workflowRun),
  );
}

function isCommentWithinWorkflowRun(
  commentCreatedAt: string,
  workflowRun: WorkflowRunResponse,
): boolean {
  const commentTime = Date.parse(commentCreatedAt);

  const startedAt = Date.parse(
    workflowRun.run_started_at ?? workflowRun.created_at,
  );

  const updatedAt = Date.parse(workflowRun.updated_at);

  if (
    Number.isNaN(commentTime)
    || Number.isNaN(startedAt)
    || Number.isNaN(updatedAt)
  ) {
    return false;
  }

  return commentTime >= startedAt && commentTime <= updatedAt;
}
