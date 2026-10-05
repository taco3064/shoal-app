import { createHash } from 'node:crypto';

import {
  allowedSummaryWorkflows, networkRoot, requestFormPath, summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';
import {
  hostedWorkflowPath, resolveHostedCapability,
} from '~app/protocol/services/hosted_capability';
import { stationReadiness } from '~app/protocol/services/station_readiness';

import {
  GitHubJoinClient, type GitHubAuthContext, type GitHubUser, type Repository,
} from '../github_join';
import { discoverReviewerNode } from '../station_join';
import { HostedGitHub, type VariablesBinding } from '../hosted_github';
import type { HostedMode, HostedSettings, HostedGrantState } from './index';

export type HostedSettingsConfig = {
  appId: string;
  privateKey: string;
  installationUrl: string;
  brokerUrl: string;
  brokerAudience: string;
  authorizationAvailable: boolean;
};
type Dependencies = {
  client: GitHubJoinClient;
  config: HostedSettingsConfig;
  github?: HostedGitHub;
  fetcher?: typeof fetch;
  grantState: (repositoryId: number, reviewerId: number) => Promise<HostedGrantState>;
};
type SelectedNode = {
  identity: GitHubUser;
  repository: Repository | null;
  rootOwner: boolean;
};

function token(context: GitHubAuthContext): string {
  return typeof context === 'string'
    ? context
    : 'userToken' in context ? context.userToken : '';
}

function digest(content: string | undefined): string | null {
  return content === undefined
    ? null
    : createHash('sha256').update(content).digest('hex');
}

function mode(raw: string | null): HostedSettings['mode'] {
  const value = raw ?? '';

  if (value === '') {
    return { value: 'none', raw: value, valid: true };
  }

  return {
    value: ['none', 'review', 're-review', 'all'].includes(value)
      ? value as HostedMode
      : null,
    raw: value,
    valid: ['none', 'review', 're-review', 'all'].includes(value),
  };
}

export class HostedSettingsService {
  private readonly github: HostedGitHub;

  constructor(private readonly dependencies: Dependencies) {
    this.github = dependencies.github ?? new HostedGitHub(
      dependencies.config, dependencies.fetcher,
    );
  }

  private async discover(context: GitHubAuthContext): Promise<SelectedNode> {
    const { client } = this.dependencies;
    const identity = await client.identity(context);
    const root = await client.repository(token(context), networkRoot.fullName);

    if (identity.type !== 'User' || !Number.isSafeInteger(identity.id)
      || identity.id <= 0 || root.id !== networkRoot.repositoryId
      || root.owner.type !== 'User' || root.private
      || !Number.isSafeInteger(root.owner.id) || root.owner.id <= 0) {
      throw new Error('Hosted Reviewer identity is unavailable.');
    }

    const rootOwner = root.owner.id === identity.id;

    const repository = rootOwner
      ? root
      : await discoverReviewerNode(client, {
          token: token(context), identity, root,
        });

    return { identity, repository, rootOwner };
  }

  async inspect(context: GitHubAuthContext): Promise<HostedSettings> {
    const selected = await this.discover(context);
    const { repository, identity } = selected;
    const { config, client, grantState } = this.dependencies;

    const settings: HostedSettings = {
      repository: repository
        ? {
            id: repository.id, fullName: repository.full_name,
            defaultBranch: repository.default_branch,
          }
        : null,
      rootOwner: selected.rootOwner,
      membership: repository !== null,
      baseReady: false,
      callerSupported: false,
      auxiliarySupported: false,
      variablesAuthority: false,
      mode: { value: null, raw: '', valid: false },
      bootstrap: 'unavailable',
      grant: 'unavailable',
      copilot: 'unverified',
      installationUrl: config.installationUrl,
      authorizationAvailable: config.authorizationAvailable,
    };

    if (!repository) {
      return settings;
    }

    // Public trust inspection has no dependency on the optional App permission.
    const readToken = token(context);
    const head = await client.head(readToken, repository);

    const [form, caller, auxiliary] = await Promise.all([
      client.file(readToken, repository, requestFormPath, head),
      client.file(readToken, repository, summaryWorkflowPath, head),
      client.file(readToken, repository, hostedWorkflowPath, head),
    ]);

    const callerDigest = digest(caller?.content);

    settings.baseReady = stationReadiness({
      hasIssues: repository.has_issues,
      formDigest: digest(form?.content), workflowDigest: callerDigest,
    }).ready;

    settings.callerSupported = callerDigest !== null
      && allowedSummaryWorkflows.has(callerDigest);

    settings.auxiliarySupported = resolveHostedCapability(
      callerDigest, digest(auxiliary?.content),
    ) !== null;

    const binding = await this.github.binding(repository);

    if (binding) {
      const variables = await this.github.variables(binding);

      settings.variablesAuthority = binding.writable;
      settings.mode = mode(variables.SHOAL_AUTOMATED_REVIEW);

      settings.bootstrap = config.brokerUrl && config.brokerAudience
        ? variables.SHOAL_HOSTED_BROKER_URL === config.brokerUrl
        && variables.SHOAL_HOSTED_BROKER_AUDIENCE === config.brokerAudience
          ? 'current'
          : 'repair_required'
        : 'unavailable';
    }

    try {
      settings.grant = await grantState(repository.id, identity.id);
    } catch {
      settings.grant = 'unavailable';
    }

    await this.verifyIdentity(context, selected);

    return settings;
  }

  private async verifyIdentity(context: GitHubAuthContext, expected: SelectedNode) {
    const current = await this.discover(context);

    if (!current.repository || !expected.repository
      || current.identity.id !== expected.identity.id
      || current.repository.id !== expected.repository.id
      || current.repository.owner.id !== expected.identity.id
      || current.repository.full_name !== expected.repository.full_name
      || current.repository.default_branch !== expected.repository.default_branch
      || current.rootOwner !== expected.rootOwner) {
      throw new Error('STALE_PLAN');
    }
  }

  private async prepare(context: GitHubAuthContext, repositoryId: number) {
    const selected = await this.discover(context);

    if (!selected.repository || selected.repository.id !== repositoryId) {
      throw new Error('STALE_PLAN');
    }

    const binding = await this.github.binding(selected.repository);

    if (!binding?.writable) {
      throw new Error('Hosted Variables write authority is unavailable.');
    }

    return { selected, binding };
  }

  private async guard(
    context: GitHubAuthContext,
    selected: SelectedNode,
    binding: VariablesBinding,
  ) {
    await this.verifyIdentity(context, selected);
    const current = await this.github.binding(binding.repository);

    if (!current?.writable || current.installationId !== binding.installationId) {
      throw new Error('STALE_PLAN');
    }
  }

  private async requireCapability(context: GitHubAuthContext, repositoryId: number) {
    const settings = await this.inspect(context);

    if (settings.repository?.id !== repositoryId || !settings.membership
      || !settings.baseReady || !settings.callerSupported
      || !settings.auxiliarySupported || !settings.variablesAuthority
      || settings.bootstrap === 'unavailable') {
      throw new Error('Hosted capability is unavailable.');
    }

    return settings;
  }

  async configure(
    context: GitHubAuthContext,
    repositoryId: number,
    value: HostedMode,
    confirmed: boolean,
  ): Promise<HostedSettings> {
    if (!['none', 'review', 're-review', 'all'].includes(value)) {
      throw new Error('Invalid Hosted semantic mode.');
    }

    if (value !== 'none' && confirmed !== true) {
      throw new Error('Explicit recurring Hosted authorization is required.');
    }

    const { selected, binding } = await this.prepare(context, repositoryId);

    const verify = async () => {
      await this.guard(context, selected, binding);

      if (value !== 'none') {
        await this.requireCapability(context, repositoryId);
      }
    };

    if (value !== 'none') {
      await verify();
      await this.convergeBootstrap(binding, verify);
    }

    // Mode is written last; partial bootstrap never silently enables execution.
    await this.github.write(binding, 'SHOAL_AUTOMATED_REVIEW', value, verify);

    return this.inspect(context);
  }

  private async convergeBootstrap(
    binding: VariablesBinding,
    verify: () => Promise<void>,
  ) {
    const { brokerUrl, brokerAudience } = this.dependencies.config;

    if (!brokerUrl || !brokerAudience) {
      throw new Error('Platform Hosted broker configuration is unavailable.');
    }

    await this.github.write(binding, 'SHOAL_HOSTED_BROKER_URL', brokerUrl, verify);

    await this.github.write(
      binding, 'SHOAL_HOSTED_BROKER_AUDIENCE', brokerAudience, verify,
    );
  }

  async repair(
    context: GitHubAuthContext, repositoryId: number,
  ): Promise<HostedSettings> {
    const { selected, binding } = await this.prepare(context, repositoryId);

    const verify = async () => {
      await this.guard(context, selected, binding);
      await this.requireCapability(context, repositoryId);
    };

    await verify();
    await this.convergeBootstrap(binding, verify);

    return this.inspect(context);
  }
}
