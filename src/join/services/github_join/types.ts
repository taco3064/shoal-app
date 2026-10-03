export type GitHubUser = { id: number; login: string; type: string };
// Identity objects come from the authenticated server session, never request JSON.
// The string form is transient OAuth callback / isolated adapter-test authority.
export type GitHubAuthContext
  = | GitHubUser
    | string
    | (GitHubUser & { userToken: string });
export type Repository = {
  id: number;
  full_name: string;
  default_branch: string;
  fork: boolean;
  owner: GitHubUser;
  parent?: { id: number };
  has_issues: boolean;
  permissions?: { admin?: boolean };
  private: boolean;
};
export type AppConfig = {
  appId: string;
  privateKey: string;
};
export type GitFile = { sha: string; content: string };
export type ActionsPolicy = {
  enabled: boolean;
  allowed_actions?: string;
  sha_pinning_required?: boolean;
};
export type Workflow = { id: number; path: string; state: string };
export type NodeBinding = { repository: Repository; installationId: number };
export type ContentChange = { path: string; content: string };
export type MutationPermission
  = 'issues' | 'actions' | 'workflow' | 'managed' | 'policy';
export type Installation = {
  id: number;
  account: GitHubUser;
  permissions: Record<string, string>;
  suspended_at?: string | null;
};
