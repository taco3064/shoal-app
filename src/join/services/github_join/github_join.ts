import { summaryWorkflowPath } from '~app/protocol/services/network_compatibility';

import {
  commitContent,
  validateContentMutation,
  type GitRequest,
} from './content_write';
import { encodeLocator, encodePath } from './locators';
import { appJwt } from './auth';
import { GitHubError } from './errors';
import { githubRequest } from './request';
import type {
  ActionsPolicy,
  AppConfig,
  ContentChange,
  GitFile,
  GitHubUser,
  GitHubAuthContext,
  Installation,
  MutationPermission,
  NodeBinding,
  Repository,
  Workflow,
} from './types';

const operationPermissions: Record<
  MutationPermission,
  Record<string, string>
> = {
  issues: { metadata: 'read', administration: 'write' },
  actions: { metadata: 'read', administration: 'write' },
  workflow: { metadata: 'read', actions: 'write' },
  managed: { metadata: 'read', contents: 'write' },
  policy: { metadata: 'read', contents: 'write' },
};

export class GitHubJoinClient {
  constructor(
    private readonly config: AppConfig,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async request<T>(
    token: string,
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    return githubRequest<T>(this.fetcher, { token, path, method, body });
  }

  async identity(context: GitHubAuthContext): Promise<GitHubUser> {
    if (typeof context === 'string') {
      return this.request(context, '/user');
    }

    if ('userToken' in context) {
      const identity = await this.request<GitHubUser>(context.userToken, '/user');

      if (
        identity.id !== context.id
        || identity.type !== 'User'
        || identity.login !== context.login
      ) {
        throw new Error('Authenticated GitHub identity mismatch.');
      }

      return identity;
    }

    if (!Number.isSafeInteger(context.id) || context.id <= 0 || context.type !== 'User') {
      throw new Error('Authenticated Personal Account identity is unavailable.');
    }

    const identity = await this.request<GitHubUser>('', `/user/${context.id}`);

    if (identity.id !== context.id || identity.type !== 'User') {
      throw new Error('Authenticated GitHub identity mismatch.');
    }

    return identity;
  }

  async* rootForks(
    token: string,
    verifiedRoot: Repository,
  ): AsyncGenerator<Repository[]> {
    for (let page = 1; page <= 100; page += 1) {
      const result = await this.request<Repository[]>(
        token,
        `/repos/${encodeLocator(verifiedRoot.full_name)}/forks?per_page=100&page=${page}`,
      );

      if (!Array.isArray(result)) {
        throw new GitHubError(200, {
          pathClass: 'root_fork_discovery',
          failure: 'invalid_response',
        });
      }

      yield result;

      if (result.length < 100) {
        return;
      }
    }

    throw new GitHubError(0, {
      pathClass: 'root_fork_discovery',
      failure: 'pagination',
    });
  }

  async* ownerRepositories(
    token: string,
    identity: GitHubUser,
  ): AsyncGenerator<Repository[]> {
    for (let page = 1; page <= 100; page += 1) {
      const result = await this.request<Repository[]>(
        token,
        `/users/${encodeURIComponent(identity.login)}/repos?type=owner&per_page=100&page=${page}`,
      );

      if (!Array.isArray(result)) {
        throw new GitHubError(200, {
          pathClass: 'owner_repository_discovery',
          failure: 'invalid_response',
        });
      }

      yield result;

      if (result.length < 100) {
        return;
      }
    }

    throw new GitHubError(0, {
      pathClass: 'owner_repository_discovery',
      failure: 'pagination',
    });
  }

  repository(token: string, locator: string): Promise<Repository> {
    return this.request(token, `/repos/${encodeLocator(locator)}`);
  }

  repositoryById(token: string, id: number): Promise<Repository> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Invalid authoritative repository identity.');
    }

    return this.request(token, `/repositories/${id}`);
  }

  async binding(
    _token: string,
    repository: Repository,
  ): Promise<NodeBinding | null> {
    let installation: Installation;

    try {
      installation = await this.request(
        appJwt(this.config),
        `/repos/${encodeLocator(repository.full_name)}/installation`,
      );
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return null;
      }

      throw error;
    }

    if (
      installation.account.id !== repository.owner.id
      || installation.suspended_at
    ) {
      return null;
    }

    const required = {
      contents: 'write',
      workflows: 'write',
      actions: 'write',
      administration: 'write',
    };

    if (
      Object.entries(required).some(
        ([name, level]) => installation.permissions[name] !== level,
      )
    ) {
      return null;
    }

    // Repository installation lookup proves this exact selected repository is
    // included. A repository_ids-scoped token is minted only for that node.
    // The authenticated owner/admin identity is independently checked upstream.
    return { repository, installationId: installation.id };
  }

  async inspectionToken(binding: NodeBinding): Promise<string> {
    return this.installationToken(binding, {
      metadata: 'read',
      contents: 'read',
      actions: 'read',
      administration: 'read',
    });
  }

  private async installationToken(
    binding: NodeBinding,
    permissions: Record<string, string>,
  ): Promise<string> {
    const result = await this.request<{ token: string }>(
      appJwt(this.config),
      `/app/installations/${binding.installationId}/access_tokens`,
      'POST',
      {
        repository_ids: [binding.repository.id],
        permissions,
      },
    );

    return result.token;
  }

  async head(token: string, repository: Repository): Promise<string> {
    const ref = await this.request<{ object: { sha: string } }>(
      token,
      `/repos/${encodeLocator(repository.full_name)}/git/ref/heads/${encodeURIComponent(repository.default_branch)}`,
    );

    return ref.object.sha;
  }

  async file(
    token: string,
    repository: Repository,
    path: string,
    head: string,
  ): Promise<GitFile | null> {
    try {
      const file = await this.request<{
        type: string;
        sha: string;
        content: string;
        encoding: string;
      }>(
        token,
        `/repos/${encodeLocator(repository.full_name)}/contents/${encodePath(path)}?ref=${encodeURIComponent(head)}`,
      );

      if (!file || file.type !== 'file' || file.encoding !== 'base64'
        || typeof file.sha !== 'string' || typeof file.content !== 'string') {
        throw new Error('Expected a regular GitHub file.');
      }

      return {
        sha: file.sha,
        content: Buffer.from(file.content, 'base64').toString('utf8'),
      };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  actions(token: string, repository: Repository): Promise<ActionsPolicy> {
    return this.request(
      token,
      `/repos/${encodeLocator(repository.full_name)}/actions/permissions`,
    );
  }

  async workflow(
    token: string,
    repository: Repository,
  ): Promise<Workflow | null> {
    try {
      return await this.request(
        token,
        `/repos/${encodeLocator(repository.full_name)}/actions/workflows/reviewer-summary.yml`,
      );
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async enableIssues(binding: NodeBinding): Promise<void> {
    const token = await this.installationToken(
      binding,
      operationPermissions.issues,
    );

    await this.request(
      token,
      `/repos/${encodeLocator(binding.repository.full_name)}`,
      'PATCH',
      { has_issues: true },
    );
  }

  async enableActions(
    binding: NodeBinding,
    expectedPolicy: ActionsPolicy,
  ): Promise<void> {
    const token = await this.installationToken(
      binding,
      operationPermissions.actions,
    );

    const policy = await this.actions(token, binding.repository);

    if (JSON.stringify(policy) !== JSON.stringify(expectedPolicy)) {
      throw new Error('STALE_PLAN');
    }

    const body: ActionsPolicy = { enabled: true };

    if (policy.allowed_actions !== undefined) {
      body.allowed_actions = policy.allowed_actions;
    }

    if (policy.sha_pinning_required !== undefined) {
      body.sha_pinning_required = policy.sha_pinning_required;
    }

    await this.request(
      token,
      `/repos/${encodeLocator(binding.repository.full_name)}/actions/permissions`,
      'PUT',
      body,
    );
  }

  async enableWorkflow(binding: NodeBinding): Promise<number> {
    const token = await this.installationToken(
      binding,
      operationPermissions.workflow,
    );

    const workflow = await this.workflow(token, binding.repository);

    if (
      !workflow
      || workflow.path !== '.github/workflows/reviewer-summary.yml'
    ) {
      throw new Error('Canonical workflow identity is unavailable.');
    }

    await this.request(
      token,
      `/repos/${encodeLocator(binding.repository.full_name)}/actions/workflows/${workflow.id}/enable`,
      'PUT',
    );

    return workflow.id;
  }

  async commitFiles(
    binding: NodeBinding,
    expectedHead: string,
    changes: ContentChange[],
    kind: 'managed' | 'policy',
    verifyRoot: () => Promise<void>,
  ): Promise<string> {
    validateContentMutation(changes, kind);

    if (typeof verifyRoot !== 'function') {
      throw new Error('Canonical Root guard is required.');
    }

    const permissions = { ...operationPermissions[kind] };

    if (
      kind === 'managed'
      && changes.some((change) => change.path === summaryWorkflowPath)
    ) {
      permissions.workflows = 'write';
    }

    const token = await this.installationToken(binding, permissions);

    const request: GitRequest = (path, method, body) =>
      this.request(token, path, method, body);

    return commitContent(request, {
      repository: binding.repository,
      expectedHead,
      changes,
      kind,
      verifyRoot,
    });
  }
}
