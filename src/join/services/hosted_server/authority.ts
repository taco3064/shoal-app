import { networkRoot } from '~app/protocol/services/network_compatibility';

import {
  appJwt, createGitHubJoinClient, githubRequest, type Installation,
} from '../github_join';
import type { BrokerAuthority, BrokerIdentity } from '../hosted_broker';
import { brokerGithub, repositoryIdentity } from './broker_github';
import { hostedConfiguration, type HostedEnvironment } from './config';
import { grantOperation } from './grants';

export async function issueHostedAuthority(
  env: HostedEnvironment, identity: BrokerIdentity, fetcher: typeof fetch = fetch,
): Promise<BrokerAuthority> {
  const config = hostedConfiguration(env);
  const client = createGitHubJoinClient(config, fetcher);
  const github = brokerGithub(env, fetcher);

  const verify = async () => {
    const [repository, root] = await Promise.all([
      client.repositoryById('', Number(identity.repositoryId)),
      client.repositoryById('', networkRoot.repositoryId),
    ]);

    if (repository.owner.type !== 'User' || repository.private || root.private
      || root.owner.type !== 'User'
      || repository.full_name !== identity.repositoryFullName
      || String(repository.owner.id) !== identity.reviewerId
      || (repository.id !== root.id && repository.parent?.id !== root.id)
      || !['review', 're-review', 'all'].includes(
        await github.readMode(repositoryIdentity(repository)) ?? '',
      )) {
      throw new Error('Current Hosted authority is unavailable.');
    }

    return repository;
  };

  const repository = await verify();

  const reviewer = await grantOperation<{ token: string; expires: number }>(env, {
    repositoryId: identity.repositoryId, reviewerId: identity.reviewerId,
  }, 'token');

  const request = <T>(path: string, method = 'GET', body?: unknown) =>
    githubRequest<T>(fetcher, { token: appJwt(config), path, method, body });

  const installation = await request<Installation>(
    `/repos/${repository.full_name.split('/').map(encodeURIComponent).join('/')}/installation`,
  );

  if (!Number.isSafeInteger(installation.id) || installation.id <= 0
    || installation.account.id !== repository.owner.id
    || installation.account.type !== 'User' || installation.suspended_at
    || installation.permissions.issues !== 'write') {
    throw new Error('Node-scoped lifecycle authority is unavailable.');
  }

  const lifecycle = await request<{ token: string; expires_at: string }>(
    `/app/installations/${installation.id}/access_tokens`, 'POST', {
      repository_ids: [repository.id], permissions: { metadata: 'read', issues: 'write' },
    },
  );

  await verify();

  return {
    reviewerToken: reviewer.token, lifecycleToken: lifecycle.token,
    expiresAt: new Date(Math.min(
      reviewer.expires, Date.parse(lifecycle.expires_at),
    )).toISOString(),
  };
}
