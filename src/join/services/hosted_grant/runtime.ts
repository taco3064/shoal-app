import { DurableObject } from 'cloudflare:workers';
import type { DurableObjectNamespace, DurableObjectState,
  Request as WorkerRequest, Response as WorkerResponse } from '@cloudflare/workers-types';
import { HostedOAuthClient } from './oauth';
import { HostedGrantStore } from './store';
import { bindingKey, GrantError, type GrantBinding, type GrantRecord } from './types';

export interface HostedGrantEnvironment {
  HOSTED_GRANTS: DurableObjectNamespace;
  HOSTED_GRANT_ENCRYPTION_KEY: string;
  HOSTED_OAUTH_CLIENT_ID: string;
  HOSTED_OAUTH_CLIENT_SECRET: string;
  JOIN_SERVICE_ORIGIN: string;
}

export function hostedGrantStub(env: HostedGrantEnvironment, binding: GrantBinding) {
  return env.HOSTED_GRANTS.get(env.HOSTED_GRANTS.idFromName(bindingKey(binding)));
}

export class HostedGrant extends DurableObject<HostedGrantEnvironment> {
  private grant: HostedGrantStore;
  constructor(state: DurableObjectState, env: HostedGrantEnvironment) {
    super(state, env);
    const callback = new URL('/hosted/auth/callback', env.JOIN_SERVICE_ORIGIN);

    if (callback.protocol !== 'https:' || !env.HOSTED_OAUTH_CLIENT_ID
      || !env.HOSTED_OAUTH_CLIENT_SECRET
      || !env.HOSTED_GRANT_ENCRYPTION_KEY
      || env.HOSTED_GRANT_ENCRYPTION_KEY.length < 32) {
      throw new GrantError('GRANT_UNAVAILABLE');
    }

    this.grant = new HostedGrantStore({
      storage: {
        read: () => state.storage.get<GrantRecord>('reviewer-grant'),
        write: (record) => state.storage.put('reviewer-grant', record),
      },
      oauth: new HostedOAuthClient({
        clientId: env.HOSTED_OAUTH_CLIENT_ID,
        clientSecret: env.HOSTED_OAUTH_CLIENT_SECRET,
        callbackUrl: callback.href,
      }),
      encryptionKey: env.HOSTED_GRANT_ENCRYPTION_KEY,
    });
  }

  // Only the bound Worker reaches this DO. The public router must authenticate
  // the browser session or complete OIDC context before forwarding operations.
  async fetch(request: WorkerRequest): Promise<WorkerResponse> {
    let response: Response;

    try {
      if (request.method !== 'POST'
        || !request.url.startsWith('https://hosted-grant.internal/')) {
        throw new GrantError('GRANT_UNAVAILABLE');
      }

      const bytes = await request.arrayBuffer();

      if (bytes.byteLength > 8192) {
        throw new GrantError('GRANT_UNAVAILABLE');
      }

      const input = JSON.parse(new TextDecoder().decode(bytes)) as {
        operation: string;
        binding: GrantBinding;
        sessionId: string;
        state: string;
        launchTicket: string;
        browserBinding: string;
        code: string;
      };

      bindingKey(input.binding);

      const result = input.operation === 'status'
        ? await this.grant.status(input.binding)
        : input.operation === 'begin'
          ? await this.grant.begin(input.binding, input.sessionId)
          : input.operation === 'launch'
            ? await this.grant.launch(input.binding, input)
            : input.operation === 'callback'
              ? await this.grant.callback(input.binding, input)
              : input.operation === 'disconnect'
                ? await this.grant.disconnect(input.binding)
                : input.operation === 'token'
                  ? await this.grant.token(input.binding)
                  : undefined;

      if (!result) {
        throw new GrantError('GRANT_UNAVAILABLE');
      }

      response = Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      response = Response.json({ error: {
        code: error instanceof GrantError ? error.code : 'GRANT_UNAVAILABLE',
        message: 'Recurring Reviewer authority is unavailable. Reconnect explicitly.',
      } }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }

    const RuntimeResponse = globalThis.Response as unknown as typeof WorkerResponse;

    return new RuntimeResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: [...response.headers.entries()],
    });
  }
}
