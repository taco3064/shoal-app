import type {
  GitHubComment,
  GitHubUser,
  RequesterNode,
} from '../reviewer_summary';
import type {
  CommentResponse,
  GitHubAppResponse,
  GitHubUserResponse,
  IssueResponse,
  RepositoryResponse,
  WorkflowRunResponse,
} from './types';

export function parseNextLink(linkHeader: string | null): string | null {
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

export function toComment(comment: CommentResponse): GitHubComment {
  return {
    author: toUser(comment.user),
    body: comment.body ?? '',
    createdAt: comment.created_at,
    id: comment.id,
    performedViaGitHubApp: toApp(comment.performed_via_github_app),
  };
}

export function toRequesterNode(
  repository: RepositoryResponse,
): RequesterNode {
  return {
    id: repository.id,
    isFork: repository.fork,
    owner: toUser(repository.owner),
    parentRepositoryId: repository.parent?.id ?? 0,
  };
}

export function toUser(user: GitHubUserResponse): GitHubUser {
  return {
    id: user.id,
    login: user.login,
    type: user.type,
  };
}

export function isDirectFork(
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

export function isIssueResponse(value: unknown): value is IssueResponse {
  return (
    isRecord(value)
    && !('pull_request' in value)
    && typeof value.number === 'number'
    && typeof value.state === 'string'
    && isUserResponse(value.user)
  );
}

export function isCommentResponse(value: unknown): value is CommentResponse {
  return (
    isRecord(value)
    && typeof value.id === 'number'
    && typeof value.created_at === 'string'
    && isUserResponse(value.user)
    && isOptionalGitHubApp(value.performed_via_github_app)
  );
}

export function isRepositoryResponse(
  value: unknown,
): value is RepositoryResponse {
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

export function isWorkflowRunResponse(
  value: unknown,
): value is WorkflowRunResponse {
  return (
    isRecord(value)
    && typeof value.id === 'number'
    && typeof value.run_attempt === 'number'
    && typeof value.path === 'string'
    && typeof value.head_sha === 'string'
    && typeof value.created_at === 'string'
    && typeof value.updated_at === 'string'
    && isRepositoryRef(value.repository)
    && isOptionalRepositoryRef(value.head_repository)
  );
}

function toApp(app: GitHubAppResponse | null | undefined) {
  if (!app) {
    return null;
  }

  return { slug: app.slug };
}

function isUserResponse(value: unknown): value is GitHubUserResponse {
  return (
    isRecord(value)
    && typeof value.id === 'number'
    && typeof value.login === 'string'
    && typeof value.type === 'string'
  );
}

function isOptionalGitHubApp(value: unknown): boolean {
  return value === undefined || value === null || isGitHubAppResponse(value);
}

function isGitHubAppResponse(value: unknown): value is GitHubAppResponse {
  return isRecord(value) && typeof value.slug === 'string';
}

function isOptionalRepositoryRef(value: unknown): boolean {
  return value === undefined || value === null || isRepositoryRef(value);
}

function isRepositoryRef(value: unknown): value is { id: number } {
  return isRecord(value) && typeof value.id === 'number';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
