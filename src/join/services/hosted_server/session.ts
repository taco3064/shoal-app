import { createGitHubJoinClient, githubFailure, type GitHubUser } from '../github_join';
import { HostedSettingsService, type HostedMode,
  type HostedSettings } from '../hosted_settings';
import { hostedConfiguration, type HostedEnvironment } from './config';
import { grantOperation, grantState } from './grants';

type Identity = GitHubUser & { userToken: string };
type Service = Pick<HostedSettingsService, 'inspect' | 'configure' | 'repair'>;
export interface HostedSessionDependencies {
  service: (env: HostedEnvironment) => Service;
  grant: typeof grantOperation;
}

const defaults: HostedSessionDependencies = {
  service: (env) => {
    const config = hostedConfiguration(env);

    return new HostedSettingsService({ config,
      client: createGitHubJoinClient(config),
      grantState: (repositoryId, reviewerId) => grantState(env, repositoryId, reviewerId),
    });
  },
  grant: grantOperation,
};

function json(status: number, value: unknown, headers?: HeadersInit): Response {
  const result = new Headers(headers);

  result.set('Cache-Control', 'no-store');

  return Response.json(value, { status, headers: result });
}

function rejected(): Response {
  return json(400, { error: { code: 'HOSTED_REQUEST_REJECTED',
    message: 'Inspect Hosted Review again before making this change.' } });
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    throw new Error('Invalid request');
  }

  const bytes = await request.arrayBuffer();

  if (bytes.byteLength > 4096) {
    throw new Error('Invalid request');
  }

  const input: unknown = JSON.parse(new TextDecoder().decode(bytes));

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid request');
  }

  return input as Record<string, unknown>;
}

function strictFields(input: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(input).some((field) => !fields.includes(field))) {
    throw new Error('Invalid request');
  }
}

function repositoryId(input: Record<string, unknown>): number {
  if (!Number.isSafeInteger(input.repositoryId) || (input.repositoryId as number) <= 0) {
    throw new Error('Invalid repository identity');
  }

  return input.repositoryId as number;
}

async function boundInspection(service: Service, identity: Identity,
  id: number): Promise<HostedSettings> {
  const settings = await service.inspect(identity);

  if (!settings.membership || settings.repository?.id !== id
    || identity.type !== 'User'
    || !Number.isSafeInteger(identity.id) || identity.id <= 0) {
    throw new Error('Reviewer binding changed');
  }

  return settings;
}

export function createHostedSessionHandler(dependencies = defaults) {
  // JoinHttp owns exact-origin, live-session and CSRF validation before this call.
  return async function handle(request: Request, env: HostedEnvironment,
    identity: Identity, sessionId: string): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (request.method !== 'POST' || ![
      '/api/hosted/inspect', '/api/hosted/mode', '/api/hosted/repair',
      '/api/hosted/connect', '/api/hosted/disconnect',
    ].includes(path)) {
      return rejected();
    }

    try {
      const input = await body(request);
      const service = dependencies.service(env);

      if (path === '/api/hosted/inspect') {
        strictFields(input, []);

        return json(200, await service.inspect(identity));
      }

      const id = repositoryId(input);

      if (path === '/api/hosted/mode') {
        strictFields(input, ['repositoryId', 'mode', 'confirmed']);

        if (!['none', 'review', 're-review', 'all'].includes(String(input.mode))
          || (input.confirmed !== undefined && typeof input.confirmed !== 'boolean')) {
          return rejected();
        }

        return json(200, await service.configure(identity, id,
          input.mode as HostedMode, input.confirmed === true));
      }

      if (path === '/api/hosted/repair') {
        strictFields(input, ['repositoryId']);

        return json(200, await service.repair(identity, id));
      }

      strictFields(input, path === '/api/hosted/connect'
        ? ['repositoryId', 'confirmed']
        : ['repositoryId']);

      const settings = await boundInspection(service, identity, id);
      const binding = { reviewerId: String(identity.id), repositoryId: String(id) };

      if (path === '/api/hosted/connect') {
        if (input.confirmed !== true || !sessionId || !settings.authorizationAvailable) {
          return rejected();
        }

        const result = await dependencies.grant<{
          state: string;
          launchTicket: string;
        }>(env, binding, 'begin', { sessionId });

        if (!/^[A-Za-z0-9_-]{43}$/.test(result.launchTicket)
          || !new RegExp(`^${id}\\.${identity.id}\\.[A-Za-z0-9_-]{43}$`)
            .test(result.state)) {
          return rejected();
        }

        const target = new URL('/hosted/auth/start', env.JOIN_SERVICE_ORIGIN);

        if (target.protocol !== 'https:') {
          return rejected();
        }

        target.searchParams.set('state', result.state);
        target.searchParams.set('ticket', result.launchTicket);

        return json(200, { authorizationUrl: target.href });
      }

      await dependencies.grant(env, binding, 'disconnect');

      return json(200, await service.inspect(identity));
    } catch (error) {
      const failure = githubFailure(error);

      if (failure) {
        return json(failure.httpStatus, { error: failure.error });
      }

      return json(403, { error: { code: 'HOSTED_UNAVAILABLE',
        message: 'Hosted Review is unavailable. Inspect status or reconnect.' } });
    }
  };
}

export const handleHostedSession = createHostedSessionHandler();
