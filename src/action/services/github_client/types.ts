export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<ResponseLike>;

export type ResponseLike = {
  ok: boolean;
  status: number;
  headers: {
    get: (name: string) => string | null;
  };
  json: () => Promise<unknown>;
};

export type RepositoryResponse = {
  id: number;
  full_name: string;
  name: string;
  fork: boolean;
  owner: GitHubUserResponse;
  parent?: { id: number } | null;
  default_branch: string;
};

export type GitHubUserResponse = {
  id: number;
  login: string;
  type: string;
};

export type GitHubAppResponse = {
  slug: string;
};

export type GitHubClientOptions = {
  baseUrl?: string;
  fetch?: FetchLike;
  token?: string;
};

export type IssueResponse = {
  number: number;
  state: string;
  body?: string | null;
  user: GitHubUserResponse;
  pull_request?: unknown;
};

export type CommentResponse = {
  id: number;
  body?: string | null;
  created_at: string;
  user: GitHubUserResponse;
  performed_via_github_app?: GitHubAppResponse | null;
};
