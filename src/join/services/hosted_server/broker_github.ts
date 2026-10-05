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

export function brokerGithub(
  env: HostedEnvironment, fetcher: typeof fetch = fetch,
): HostedBrokerGithub {
  const config = hostedConfiguration(env);
  const client = createGitHubJoinClient(config, fetcher);
  const variables = new HostedGitHub(config, fetcher);

  const request = <T>(path: string) => githubRequest<T>(fetcher, {
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
