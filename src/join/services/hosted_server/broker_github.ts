import { Buffer } from 'node:buffer';

import {
  createGitHubJoinClient, githubRequest, GitHubError, type Repository,
} from '../github_join';
import { HostedGitHub } from '../hosted_github';
import type { BrokerRepository, BrokerRun, HostedBrokerGithub } from '../hosted_broker';
import { hostedConfiguration, type HostedEnvironment } from './config';

export function repositoryIdentity(repository: Repository): BrokerRepository {
  if (!Number.isSafeInteger(repository.id) || repository.id <= 0
    || !Number.isSafeInteger(repository.owner.id) || repository.owner.id <= 0) {
    throw new Error('Repository identity is unavailable.');
  }

  return {
    id: String(repository.id), fullName: repository.full_name,
    ownerId: String(repository.owner.id), ownerType: repository.owner.type,
    parentId: repository.parent ? String(repository.parent.id) : null,
    defaultBranch: repository.default_branch, private: repository.private,
  };
}

function locator(fullName: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
    throw new Error('Repository locator is unavailable.');
  }

  return fullName.split('/').map(encodeURIComponent).join('/');
}

export function publicGithubFetcher(
  env: HostedEnvironment, fetcher: typeof fetch,
): typeof fetch {
  if (!env.HOSTED_OAUTH_CLIENT_ID || !env.HOSTED_OAUTH_CLIENT_SECRET) {
    throw new Error('Hosted public API authentication is unavailable.');
  }

  const authorization = `Basic ${Buffer.from(
    `${env.HOSTED_OAUTH_CLIENT_ID}:${env.HOSTED_OAUTH_CLIENT_SECRET}`,
  ).toString('base64')}`;

  return (input, init) => {
    const headers = new Headers(init?.headers);

    // Only our explicit, otherwise anonymous GitHub API GETs use the OAuth
    // app's public-data quota. Existing user and installation tokens stay intact.
    if (typeof input !== 'string' || init?.method !== 'GET'
      || new URL(input).origin !== 'https://api.github.com'
      || headers.has('Authorization')) {
      return fetcher(input, init);
    }

    headers.set('Authorization', authorization);

    return fetcher(input, { ...init, headers, redirect: 'manual' });
  };
}

export function brokerGithub(
  env: HostedEnvironment, fetcher: typeof fetch = fetch,
): HostedBrokerGithub {
  const config = hostedConfiguration(env);
  const publicFetcher = publicGithubFetcher(env, fetcher);
  const client = createGitHubJoinClient(config, publicFetcher);
  const variables = new HostedGitHub(config, fetcher);

  const request = <T>(path: string) => githubRequest<T>(publicFetcher, {
    token: '', path, method: 'GET',
  });

  return {
    async getRepository(id) {
      return repositoryIdentity(await client.repositoryById('', Number(id)));
    },
    async getRun(fullName, id) {
      const run = await request<{
        id: number; repository: { id: number }; run_attempt: number;
        head_sha: string; head_branch: string;
        event: string; status: string; path: string;
      }>(`/repos/${locator(fullName)}/actions/runs/${encodeURIComponent(id)}`);

      const result: BrokerRun = {
        id: String(run.id), repositoryId: String(run.repository.id),
        runAttempt: String(run.run_attempt), headSha: run.head_sha,
        headBranch: run.head_branch, event: run.event, status: run.status, path: run.path,
      };

      return result;
    },
    async readWorkflow(fullName, path, sha) {
      try {
        const file = await request<{ type: string; encoding: string; content: string }>(
          `/repos/${locator(fullName)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(sha)}`,
        );

        if (file.type !== 'file' || file.encoding !== 'base64'
          || typeof file.content !== 'string' || file.content.length > 180000) {
          throw new Error('Execution workflow bytes are unavailable.');
        }

        return new Uint8Array(Buffer.from(file.content, 'base64'));
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) {
          return null;
        }

        throw error;
      }
    },
    async readMode(expected) {
      const repository = await client.repositoryById('', Number(expected.id));

      if (JSON.stringify(repositoryIdentity(repository)) !== JSON.stringify(expected)) {
        throw new Error('Current Membership changed.');
      }

      const binding = await variables.binding(repository);

      if (!binding) {
        throw new Error('Hosted Variables authority is unavailable.');
      }

      return (await variables.variables(binding)).SHOAL_AUTOMATED_REVIEW;
    },
  };
}
