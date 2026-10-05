import {
  appJwt, githubRequest, GitHubError,
  type AppConfig, type Installation, type Repository,
} from '../github_join';

export const hostedVariableNames = [
  'SHOAL_AUTOMATED_REVIEW',
  'SHOAL_HOSTED_BROKER_URL',
  'SHOAL_HOSTED_BROKER_AUDIENCE',
] as const;
export type HostedVariableName = typeof hostedVariableNames[number];
export type VariablesBinding = {
  repository: Repository;
  installationId: number;
  writable: boolean;
};
export type HostedVariables = Record<HostedVariableName, string | null>;

function locator(repository: Repository): string {
  return repository.full_name.split('/').map(encodeURIComponent).join('/');
}

export class HostedGitHub {
  constructor(
    private readonly config: AppConfig,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private request<T>(token: string, path: string, method = 'GET', body?: unknown) {
    return githubRequest<T>(this.fetcher, { token, path, method, body });
  }

  async binding(repository: Repository): Promise<VariablesBinding | null> {
    let installation: Installation;

    try {
      installation = await this.request<Installation>(
        appJwt(this.config), `/repos/${locator(repository)}/installation`,
      );
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) {
        return null;
      }

      throw error;
    }

    if (!Number.isSafeInteger(installation.id) || installation.id <= 0
      || installation.account.id !== repository.owner.id
      || installation.account.type !== 'User' || installation.suspended_at
      || !['read', 'write'].includes(installation.permissions.actions_variables)) {
      return null;
    }

    return {
      repository,
      installationId: installation.id,
      writable: installation.permissions.actions_variables === 'write',
    };
  }

  private async token(binding: VariablesBinding, write = false): Promise<string> {
    if (write && !binding.writable) {
      throw new Error('Hosted Variables write authority is unavailable.');
    }

    const result = await this.request<{ token: string }>(
      appJwt(this.config), `/app/installations/${binding.installationId}/access_tokens`,
      'POST', {
        repository_ids: [binding.repository.id],
        permissions: { metadata: 'read', actions_variables: write ? 'write' : 'read' },
      },
    );

    if (typeof result.token !== 'string' || !result.token) {
      throw new Error('Hosted Variables authority is unavailable.');
    }

    return result.token;
  }

  private variablePath(repository: Repository, name: HostedVariableName): string {
    if (!hostedVariableNames.includes(name)) {
      throw new Error('Variable is outside Hosted configuration authority.');
    }

    return `/repos/${locator(repository)}/actions/variables/${name}`;
  }

  private async read(token: string, repository: Repository, name: HostedVariableName) {
    try {
      const result = await this.request<{ name: string; value: string }>(
        token, this.variablePath(repository, name),
      );

      if (result.name !== name || typeof result.value !== 'string') {
        throw new Error('Authoritative Hosted variable response is invalid.');
      }

      return result.value;
    } catch (error) {
      // The selected-repository token has already proven Variables authority.
      if (error instanceof GitHubError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async variables(binding: VariablesBinding): Promise<HostedVariables> {
    const token = await this.token(binding);

    const values = await Promise.all(hostedVariableNames.map((name) =>
      this.read(token, binding.repository, name),
    ));

    return Object.fromEntries(hostedVariableNames.map((name, index) =>
      [name, values[index]],
    )) as HostedVariables;
  }

  async write(
    binding: VariablesBinding,
    name: HostedVariableName,
    value: string,
    verify: () => Promise<void>,
  ): Promise<void> {
    const path = this.variablePath(binding.repository, name);
    const token = await this.token(binding, true);
    const current = await this.read(token, binding.repository, name);

    await verify();

    if (current !== value) {
      await githubRequest<void>(this.fetcher, {
        token,
        path: current === null
          ? `/repos/${locator(binding.repository)}/actions/variables`
          : path,
        method: current === null ? 'POST' : 'PATCH',
        body: { name, value },
        response: 'empty',
      });
    }

    const readback = await this.read(token, binding.repository, name);

    await verify();

    if (readback !== value) {
      throw new Error('Hosted variable authoritative read-back mismatch.');
    }
  }
}
