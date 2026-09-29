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

export class GitHubApi {
  constructor(
    private readonly token: string,
    private readonly fetcher = fetch,
  ) {}

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

    for (let page = 1; ; page += 1) {
      if (page > 1000) {
        throw new Error(`Pagination bound exceeded: ${path}`);
      }

      const separator = path.includes('?') ? '&' : '?';

      const data = await this.json<T[] | Record<string, unknown>>(
        `${path}${separator}per_page=100&page=${page}`,
      );

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

      if (entries.length < 100) {
        return result;
      }
    }
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
    const response = await this.fetcher(url, { redirect: 'follow' });

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
    const response = await this.fetcher(`https://api.github.com${path}`, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new GitHubHttpError(path, response.status);
    }

    return response;
  }
}

export class GitHubHttpError extends Error {
  constructor(
    path: string,
    readonly status: number,
  ) {
    super(`GitHub API returned ${status} for ${path}`);
  }
}
