type Failure = 'http' | 'timeout' | 'transport' | 'invalid_response' | 'pagination';
type RateLimit = 'primary' | 'secondary' | null;

export class GitHubError extends Error {
  readonly details: {
    pathClass: string;
    failure: Failure;
    rateLimitClass: RateLimit;
    rateLimitRemaining: string | null;
    rateLimitReset: string | null;
  };

  constructor(
    public readonly status: number,
    details: {
      pathClass: string;
      failure?: Failure;
      rateLimitClass?: RateLimit;
      rateLimitRemaining?: string | null;
      rateLimitReset?: string | null;
    },
  ) {
    super(`GitHub ${details.pathClass} failed (${details.failure ?? 'http'}, ${status}).`);

    this.details = {
      failure: 'http',
      rateLimitClass: null,
      rateLimitRemaining: null,
      rateLimitReset: null,
      ...details,
    };
  }
}

export function pathClass(path: string): string {
  if (path === '/user' || /^\/user\/\d+$/.test(path)) {
    return 'user_identity';
  }

  if (/^\/users\/[^/]+\/repos(?:\?|$)/.test(path)) {
    return 'owner_repository_discovery';
  }

  if (path.includes('/forks')) {
    return 'root_fork_discovery';
  }

  if (path.includes('/contents/')) {
    return 'repository_content_read';
  }

  if (path.includes('/actions/')) {
    return 'repository_actions';
  }

  if (path.includes('/access_tokens')) {
    return 'installation_token';
  }

  if (path.includes('/installation')) {
    return 'app_installation_binding';
  }

  if (path.includes('/git/')) {
    return 'git_data';
  }

  if (path.startsWith('/repos/') || path.startsWith('/repositories/')) {
    return 'repository_metadata';
  }

  return 'github_api';
}

// Only fixed operation classes, numeric status and bounded quota metadata cross
// the public boundary. Never serialize the upstream response, cause or request.
export function githubFailure(cause: unknown) {
  if (!(cause instanceof GitHubError)) {
    return null;
  }

  const { failure, pathClass: operation, rateLimitClass, rateLimitReset } = cause.details;
  const limited = rateLimitClass !== null;

  return {
    httpStatus: limited ? 429 : failure === 'timeout' ? 504 : 502,
    error: {
      code: limited
        ? 'GITHUB_RATE_LIMITED'
        : failure === 'timeout'
          ? 'GITHUB_TIMEOUT'
          : 'GITHUB_UPSTREAM_FAILED',
      message: limited
        ? 'GitHub rate limit is temporarily exhausted. Retry after reset.'
        : 'GitHub inspection is temporarily unavailable. Refresh status to retry.',
      status: cause.status || null,
      pathClass: operation,
      failure,
      rateLimitClass,
      rateLimitReset,
      retryable: true,
    },
  };
}
