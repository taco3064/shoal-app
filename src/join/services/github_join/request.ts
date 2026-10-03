import { GitHubError, pathClass } from './errors';

type Operation = { token: string; path: string; method: string; body?: unknown };

function unavailable(path: string, cause: unknown, signal: AbortSignal): GitHubError {
  const timeout = signal.aborted
    || (cause instanceof Error && ['TimeoutError', 'AbortError'].includes(cause.name));

  return new GitHubError(0, {
    pathClass: pathClass(path),
    failure: timeout ? 'timeout' : 'transport',
  });
}

export async function githubRequest<T>(
  fetcher: typeof fetch,
  operation: Operation,
): Promise<T> {
  const { token, path, method, body } = operation;

  if (!path.startsWith('/') || path.includes('://')) {
    throw new Error('Invalid internal GitHub operation.');
  }

  const signal = AbortSignal.timeout(15_000);
  let response: Response;

  try {
    response = await fetcher(`https://api.github.com${path}`, {
      method,
      redirect: 'manual',
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'User-Agent': 'Shoal-Quick-Web-Join',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw unavailable(path, cause, signal);
  }

  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    const quotaStatus = response.status === 403 || response.status === 429;

    throw new GitHubError(response.status, {
      pathClass: pathClass(path),
      rateLimitClass: quotaStatus && remaining === '0'
        ? 'primary'
        : response.status === 429
          || (response.status === 403 && response.headers.has('retry-after'))
          ? 'secondary'
          : null,
      rateLimitRemaining: remaining !== null && /^\d{1,12}$/.test(remaining) ? remaining : null,
      rateLimitReset: reset !== null && /^\d{1,12}$/.test(reset) ? reset : null,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return await response.json() as T;
  } catch (cause) {
    if (signal.aborted || (cause instanceof Error && cause.name !== 'SyntaxError')) {
      throw unavailable(path, cause, signal);
    }

    throw new GitHubError(response.status, {
      pathClass: pathClass(path),
      failure: 'invalid_response',
    });
  }
}
