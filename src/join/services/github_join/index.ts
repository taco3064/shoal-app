import { GitHubJoinClient } from './github_join';
import type { AppConfig } from './types';

export { GitHubJoinClient } from './github_join';
export { GitHubError, githubFailure } from './errors';

export function createGitHubJoinClient(
  config: AppConfig,
  fetcher?: typeof fetch,
): GitHubJoinClient {
  return new GitHubJoinClient(config, fetcher);
}

export type {
  AppConfig,
  GitHubUser,
  GitHubAuthContext,
  Repository,
  GitFile,
  ActionsPolicy,
  Workflow,
  NodeBinding,
  ContentChange,
  Installation,
} from './types';
