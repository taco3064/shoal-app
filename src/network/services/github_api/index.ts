import { summaryTransportTag } from '~app/protocol/services/network_compatibility';

export type GitHubRepository = {
  id: number;
  full_name: string;
  html_url: string;
  created_at: string;
  default_branch: string;
  fork: boolean;
  has_issues: boolean;
  owner: { login: string; type: string; avatar_url: string; html_url: string };
  parent?: { id: number };
  source?: { id: number };
};

export type WorkflowRun = {
  id: number;
  path: string;
  repository: { id: number };
  head_repository: { id: number } | null;
  head_sha: string;
  run_attempt: number;
  run_started_at: string;
  status: string;
  conclusion: string | null;
  html_url: string;
};

export type PublicSummary = {
  bytes: Uint8Array;
  url: string;
};

type GitHubApiOptions = {
  retryBudgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export class GitHubApi {
  private readonly retryBudgetMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly token: string,
    private readonly fetcher = fetch,
    options: GitHubApiOptions = {},
  ) {
    this.retryBudgetMs = options.retryBudgetMs ?? 30_000;

    this.sleep = options.sleep ?? ((ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }));

    this.now = options.now ?? Date.now;
  }

  async json<T>(path: string): Promise<T> {
    const response = await this.request(path);

    return response.json() as Promise<T>;
  }

  async bytes(path: string): Promise<Uint8Array> {
    const response = await this.request(
      path,
      'application/vnd.github.raw+json',
    );

    return new Uint8Array(await response.arrayBuffer());
  }

  async pages<T>(path: string, key?: string): Promise<T[]> {
    const result: T[] = [];
    let nextPath: string | null = withPagination(path, 1);

    for (let page = 1; nextPath; page += 1) {
      if (page > 1000) {
        throw new Error(`Pagination bound exceeded: ${path}`);
      }

      const response = await this.request(nextPath);
      const data = await response.json() as T[] | Record<string, unknown>;

      if (
        !Array.isArray(data)
        && typeof data.total_count === 'number'
        && data.total_count > 1000
        && path.includes('/actions/runs')
      ) {
        throw new Error(
          'GitHub Actions run listing exceeds the complete 1000-run window.',
        );
      }

      const entries = (
        key ? (data as Record<string, unknown>)[key] : data
      ) as T[];

      if (!Array.isArray(entries)) {
        throw new Error(`Invalid paginated response: ${path}`);
      }

      result.push(...entries);

      nextPath = nextPagePath(response.headers.get('link'));
    }

    return result;
  }

  repository(fullName: string): Promise<GitHubRepository> {
    return this.json(`/repos/${fullName}`);
  }

  async committedBytes(
    fullName: string,
    path: string,
    ref: string,
  ): Promise<Uint8Array | null> {
    const url = `/repos/${fullName}/contents/${path}?ref=${encodeURIComponent(ref)}`;

    try {
      return await this.bytes(url);
    } catch (error) {
      if (error instanceof GitHubHttpError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async summaryRuns(fullName: string): Promise<WorkflowRun[]> {
    return this.pages<WorkflowRun>(
      `/repos/${fullName}/actions/runs`,
      'workflow_runs',
    );
  }

  runAttempt(
    fullName: string,
    runId: number,
    attempt: number,
  ): Promise<WorkflowRun> {
    return this.json(
      `/repos/${fullName}/actions/runs/${runId}/attempts/${attempt}`,
    );
  }

  async publicSummary(
    fullName: string,
    repositoryId: number,
    runId: number,
    attempt: number,
  ): Promise<PublicSummary | null> {
    const tag = summaryTransportTag(repositoryId, runId, attempt);
    const url = `https://raw.githubusercontent.com/${fullName}/${tag}/reviewer-summary.json`;
    const response = await this.fetchWithRetry(url, { redirect: 'follow' });

    if (response.status === 404 || response.status === 410) {
      return null;
    }

    if (!response.ok) {
      throw new GitHubHttpError(url, response.status);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.length > 1024 * 1024) {
      return null;
    }

    return { bytes, url };
  }

  private async request(
    path: string,
    accept = 'application/vnd.github+json',
  ): Promise<Response> {
    const response = await this.fetchWithRetry(
      `https://api.github.com${path}`,
      {
        headers: {
          Accept: accept,
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      throw new GitHubHttpError(path, response.status, response);
    }

    return response;
  }

  private async fetchWithRetry(
    input: string,
    init: RequestInit,
  ): Promise<Response> {
    const started = this.now();
    let delayedMs = 0;

    for (;;) {
      const response = await this.fetcher(input, init);

      if (!isRetryableStatus(response.status)) {
        return response;
      }

      const elapsed = this.now() - started;
      const remaining = this.retryBudgetMs - elapsed - delayedMs;
      const delay = retryDelayMs(response, remaining, this.now());

      if (delay === null) {
        return response;
      }

      if (process.env.SHOAL_SCAN_DIAGNOSTICS === '1') {
        console.info(
          `Retrying GitHub request after ${delay}ms: ${response.status} ${input}`,
        );
      }

      await this.sleep(delay);
      delayedMs += delay;
    }
  }
}

export class GitHubHttpError extends Error {
  constructor(
    path: string,
    readonly status: number,
    readonly response?: Response,
  ) {
    super(`GitHub API returned ${status} for ${path}`);
  }
}

function withPagination(path: string, page: number): string {
  const separator = path.includes('?') ? '&' : '?';

  return `${path}${separator}per_page=100&page=${page}`;
}

function nextPagePath(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  let next: string | null = null;

  for (const part of linkHeader.split(',')) {
    const match = /^\s*<([^>]+)>;\s*rel="([^"]+)"\s*$/.exec(part);

    if (!match) {
      throw new Error('Malformed GitHub pagination Link header.');
    }

    if (match[2] === 'next') {
      const url = new URL(match[1]);

      if (url.origin !== 'https://api.github.com') {
        throw new Error('Malformed GitHub pagination next URL.');
      }

      next = `${url.pathname}${url.search}`;
    }
  }

  return next;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || [500, 502, 503, 504].includes(status);
}

function retryDelayMs(
  response: Response,
  remainingMs: number,
  now: number,
): number | null {
  const retryAfter = response.headers.get('retry-after');
  const reset = response.headers.get('x-ratelimit-reset');
  const delay = retryAfterDelayMs(retryAfter, now) ?? resetDelayMs(reset, now);

  if (delay === null) {
    return remainingMs >= 100 ? 100 : null;
  }

  return delay <= remainingMs ? delay : null;
}

function retryAfterDelayMs(value: string | null, now: number): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }

  const date = Date.parse(value);

  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function resetDelayMs(value: string | null, now: number): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  return Number.isFinite(seconds) && seconds >= 0
    ? Math.max(0, (seconds * 1000) - now)
    : null;
}
