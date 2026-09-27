import type {
  GitHubComment,
  GitHubIssue,
  GitHubUser,
  RequesterNode,
  ReviewerNode,
  SummaryResolvers,
} from '../reviewer_summary';
import type {
  CommentResponse,
  FetchLike,
  GitHubClientOptions,
  GitHubAppResponse,
  GitHubUserResponse,
  IssueResponse,
  RepositoryResponse,
} from './types';

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
    );

    const issueItems = issues.filter(isIssueResponse);
    const result: GitHubIssue[] = [];

    for (const issue of issueItems) {
      const comments = await this.paginate(
        `/repos/${repositoryFullName}/issues/${issue.number}/comments?per_page=100`,
      );

      result.push({
        author: toUser(issue.user),
        body: issue.body ?? '',
        comments: comments.filter(isCommentResponse).map(toComment),
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
        if (
          comment.author.login !== 'github-actions[bot]'
          || comment.author.type !== 'Bot'
          || comment.performedViaGitHubApp?.slug !== 'github-actions'
          || !event.automationProvenance
        ) {
          return false;
        }

        if (
          event.automationProvenance.actorLogin !== comment.author.login
          || event.automationProvenance.repositoryId !== reviewerNode.id
          || event.automationProvenance.workflowPath
          !== '.github/workflows/reviewer-summary.yml'
        ) {
          return false;
        }

        return this.commitExists(
          reviewerNode.fullName,
          event.automationProvenance.workflowCommit,
        );
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
          target.full_name,
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

    if (isDirectFork(directNameCandidate, author.id, networkRootRepositoryId)) {
      return toRequesterNode(directNameCandidate);
    }

    const repositories = await this.paginate(
      `/users/${author.login}/repos?type=owner&per_page=100`,
    );

    for (const item of repositories.filter(isRepositoryResponse)) {
      if (!item.fork) {
        continue;
      }

      const repository = await this.getRepositoryOrNull(item.full_name);

      if (isDirectFork(repository, author.id, networkRootRepositoryId)) {
        return toRequesterNode(repository);
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
    );

    const first = commits[0];

    if (!isRecord(first) || typeof first.sha !== 'string') {
      throw new GitHubReadError(`No commit found for ${fullName}:${path}.`);
    }

    return first.sha;
  }

  async commitExists(fullName: string, sha: string): Promise<boolean> {
    try {
      await this.get(`/repos/${fullName}/commits/${sha}`);

      return true;
    } catch (error) {
      if (error instanceof GitHubReadError && error.message.includes('404')) {
        return false;
      }

      throw error;
    }
  }

  async isRepositoryStarredBy(
    fullName: string,
    login: string,
  ): Promise<boolean> {
    const stargazers = await this.paginate(
      `/repos/${fullName}/stargazers?per_page=100`,
    );

    return stargazers.some(
      (stargazer) => isRecord(stargazer) && stargazer.login === login,
    );
  }

  async paginate(path: string): Promise<unknown[]> {
    const firstUrl = new URL(`${this.baseUrl}${path}`);

    firstUrl.searchParams.set('per_page', '100');
    const items: unknown[] = [];
    let nextUrl: string | null = firstUrl.toString();

    while (nextUrl) {
      const response = await this.request(nextUrl);

      if (!Array.isArray(response.body)) {
        throw new GitHubReadError(
          `GitHub paginated response for ${nextUrl} was not an array.`,
        );
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

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/u);

    if (match) {
      return match[1];
    }
  }

  return null;
}

function toComment(comment: CommentResponse): GitHubComment {
  return {
    author: toUser(comment.user),
    body: comment.body ?? '',
    createdAt: comment.created_at,
    id: comment.id,
    performedViaGitHubApp: toApp(comment.performed_via_github_app),
  };
}

function toRequesterNode(repository: RepositoryResponse): RequesterNode {
  return {
    id: repository.id,
    isFork: repository.fork,
    owner: toUser(repository.owner),
    parentRepositoryId: repository.parent?.id ?? 0,
  };
}

function toUser(user: GitHubUserResponse): GitHubUser {
  return {
    id: user.id,
    login: user.login,
    type: user.type,
  };
}

function toApp(app: GitHubAppResponse | null | undefined) {
  if (!app) {
    return null;
  }

  return { slug: app.slug };
}

function isDirectFork(
  repository: RepositoryResponse | null,
  ownerId: number,
  networkRootRepositoryId: number,
): repository is RepositoryResponse {
  return Boolean(
    repository
    && repository.fork
    && repository.owner.type === 'User'
    && repository.owner.id === ownerId
    && repository.parent?.id === networkRootRepositoryId,
  );
}

function isIssueResponse(value: unknown): value is IssueResponse {
  return (
    isRecord(value)
    && !('pull_request' in value)
    && typeof value.number === 'number'
    && typeof value.state === 'string'
    && isUserResponse(value.user)
  );
}

function isCommentResponse(value: unknown): value is CommentResponse {
  return (
    isRecord(value)
    && typeof value.id === 'number'
    && typeof value.created_at === 'string'
    && isUserResponse(value.user)
    && (
      value.performed_via_github_app === undefined
      || value.performed_via_github_app === null
      || isGitHubAppResponse(value.performed_via_github_app)
    )
  );
}

function isRepositoryResponse(value: unknown): value is RepositoryResponse {
  return (
    isRecord(value)
    && typeof value.id === 'number'
    && typeof value.full_name === 'string'
    && typeof value.name === 'string'
    && typeof value.fork === 'boolean'
    && typeof value.default_branch === 'string'
    && isUserResponse(value.owner)
  );
}

function isUserResponse(value: unknown): value is GitHubUserResponse {
  return (
    isRecord(value)
    && typeof value.id === 'number'
    && typeof value.login === 'string'
    && typeof value.type === 'string'
  );
}

function isGitHubAppResponse(value: unknown): value is GitHubAppResponse {
  return isRecord(value) && typeof value.slug === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
