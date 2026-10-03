import { readBody, readBytes } from './body';
import type {
  DurableObjectState,
  Request as WorkerRequest,
  Response as WorkerResponse,
} from '@cloudflare/workers-types';
import { DurableObject } from 'cloudflare:workers';
import { productionJoinAdapter } from './adapter';
import { loadJoinConfig, type JoinEnvironment } from './config';
import { JoinHttp, json } from './http';
import { openToken, sealToken } from './sealed_token';
import { FlowStorage, opaqueId } from './sessions';

export class JoinFlow extends DurableObject<JoinEnvironment> {
  private storage: FlowStorage;
  private userTokens = new Map<string, { token: string; expires: number }>();

  constructor(
    private state: DurableObjectState,
    env: JoinEnvironment,
  ) {
    super(state, env);
    this.storage = new FlowStorage(state.storage);
  }

  private pending: Promise<unknown> = Promise.resolve();

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const handling = this.pending.then(task);

    this.pending = handling.catch(() => {});

    return handling;
  }

  async fetch(input: WorkerRequest): Promise<WorkerResponse> {
    const response = await this.serialize(async () => {
      const request = new Request(input.url, {
        method: input.method,
        redirect: 'manual',
        headers: [...input.headers.entries()],
        body: ['GET', 'HEAD'].includes(input.method)
          ? undefined
          : await input.arrayBuffer(),
      });

      try {
        const config = loadJoinConfig(this.env);
        const flow = this.storage.read();

        const handler = new JoinHttp({
          config,
          flow,
          storage: this.storage,
          adapter: productionJoinAdapter(config),
          userToken: (sessionId) => this.userToken(config, flow, sessionId),
          retainUserToken: (sessionId, token, expires) =>
            this.retainUserToken(config, flow, sessionId, token, expires),
          forgetUserToken: (sessionId) => {
            this.userTokens.delete(sessionId);
          },
        });

        return await handler.handle(request);
      } catch (cause) {
        if (cause instanceof Error && isConfigurationError(cause.message)) {
          return json(503, {
            error: {
              code: 'CONFIGURATION_REQUIRED',
              message: cause.message,
            },
          });
        }

        const githubRateLimit = githubRateLimitError(cause);

        if (githubRateLimit) {
          return json(429, {
            error: {
              code: 'GITHUB_RATE_LIMITED',
              message:
                'GitHub rate limit is temporarily exhausted. Retry after reset.',
              status: githubRateLimit.status,
              pathClass: githubRateLimit.pathClass,
              rateLimitReset: githubRateLimit.rateLimitReset,
            },
          });
        }

        return json(400, {
          error: {
            code: 'REQUEST_REJECTED',
            message: 'Request rejected. Refresh inspection or authorize again.',
          },
        });
      }
    });

    // Both realms use the workerd global constructor; DOM declarations omit cf/webSocket.
    const RuntimeResponse
      = globalThis.Response as unknown as typeof WorkerResponse;

    return new RuntimeResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: [...response.headers.entries()],
    });
  }

  async alarm(): Promise<void> {
    return this.serialize(() => this.advance());
  }

  private async advance(): Promise<void> {
    const flow = this.storage.read();
    const expires = flow.session?.expires ?? flow.auth?.expires ?? 0;

    if (expires <= Date.now()) {
      if (flow.session) {
        this.userTokens.delete(flow.session.id);
      }

      await this.storage.clear();
    } else if (flow.session?.busy && flow.session.execution) {
      try {
        const config = loadJoinConfig(this.env);

        await new JoinHttp({
          config,
          flow,
          storage: this.storage,
          adapter: productionJoinAdapter(config),
          userToken: (sessionId) => this.userToken(config, flow, sessionId),
          retainUserToken: (sessionId, token, tokenExpires) =>
            this.retainUserToken(config, flow, sessionId, token, tokenExpires),
          forgetUserToken: (sessionId) => {
            this.userTokens.delete(sessionId);
          },
        }).step();
      } catch {
        // Infrastructure failure requires fresh inspection before retry.
        flow.session.busy = false;
        delete flow.session.execution;

        if (flow.session.job) {
          flow.session.job.status = 'failed';

          flow.session.job.error = {
            code: 'EXECUTION_STOPPED',
            message: 'Inspect again for verified progress and a fresh plan.',
          };
        }

        await this.storage.write(flow);
      }
    } else {
      await this.state.storage.setAlarm(expires);
    }
  }

  private async retainUserToken(
    config: ReturnType<typeof loadJoinConfig>,
    flow: ReturnType<FlowStorage['read']>,
    sessionId: string,
    token: string,
    expires: number,
  ): Promise<void> {
    this.userTokens.set(sessionId, { token, expires });

    if (flow.session?.id === sessionId) {
      flow.session.sealedUserToken = await sealToken(
        config.clientSecret,
        sessionId,
        token,
      );
    }
  }

  private async userToken(
    config: ReturnType<typeof loadJoinConfig>,
    flow: ReturnType<FlowStorage['read']>,
    sessionId: string,
  ): Promise<string> {
    const held = this.userTokens.get(sessionId);

    if (!held || held.expires <= Date.now()) {
      this.userTokens.delete(sessionId);

      if (
        !flow.session
        || flow.session.id !== sessionId
        || flow.session.expires <= Date.now()
        || !flow.session.sealedUserToken
      ) {
        return '';
      }

      let token: string;

      try {
        token = await openToken(
          config.clientSecret,
          sessionId,
          flow.session.sealedUserToken,
        );
      } catch {
        return '';
      }

      this.userTokens.set(sessionId, {
        token,
        expires: flow.session.expires,
      });

      return token;
    }

    return held.token;
  }
}

function isConfigurationError(message: string): boolean {
  return (
    message.endsWith(' is required')
    || message === 'Production authentication requires HTTPS'
  );
}

function githubRateLimitError(cause: unknown): null | {
  status: number;
  pathClass: string;
  rateLimitReset: string | null;
} {
  const value = cause as {
    status?: unknown;
    details?: {
      pathClass?: unknown;
      rateLimitRemaining?: unknown;
      rateLimitReset?: unknown;
    };
  };

  if (
    (value.status !== 403 && value.status !== 429)
    || value.details?.rateLimitRemaining !== '0'
  ) {
    return null;
  }

  return {
    status: value.status,
    pathClass:
      typeof value.details.pathClass === 'string'
        ? value.details.pathClass
        : 'github_api',
    rateLimitReset:
      typeof value.details.rateLimitReset === 'string'
        ? value.details.rateLimitReset
        : null,
  };
}

export async function workerFetch(
  request: Request,
  env: JoinEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  let response: Response;

  if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    const expected = env.JOIN_WEBSITE_RETURN_URL
      ? new URL(env.JOIN_WEBSITE_RETURN_URL).origin
      : '';

    response
      = request.headers.get('Origin') === expected
        ? new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
              'Access-Control-Allow-Headers':
                'Content-Type,Authorization,X-CSRF-Token',
              'Access-Control-Allow-Credentials': 'true',
            },
          })
        : json(403, {
            error: { code: 'ORIGIN_DENIED', message: 'Untrusted origin' },
          });
  } else if (url.pathname === '/health' && request.method === 'GET') {
    response = json(200, { healthy: true });
  } else {
    const candidate
      = url.pathname === '/auth/start'
        ? opaqueId()
        : url.pathname === '/auth/callback'
          ? (url.searchParams.get('state') ?? '')
          : url.pathname === '/api/session'
            ? await routingCode(request)
            : url.pathname === '/api/session/current'
              ? routingSession(request)
              : (request.headers.get('Authorization') ?? '').replace(
                  /^Session /,
                  '',
                );

    const flowId = candidate.split('.')[0];

    if (!/^[A-Za-z0-9_-]{43}$/.test(flowId)) {
      response = json(401, {
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Authorize with GitHub again.',
        },
      });
    } else {
      if (url.pathname === '/auth/start') {
        url.searchParams.set('flow', flowId);
      }

      let body: Uint8Array | undefined;

      try {
        body = ['GET', 'HEAD'].includes(request.method)
          ? undefined
          : await readBytes(request);
      } catch {
        return json(400, {
          error: {
            code: 'REQUEST_REJECTED',
            message: 'Request body is too large.',
          },
        });
      }

      const objectResponse = await env.JOIN_FLOWS.get(
        env.JOIN_FLOWS.idFromName(flowId),
      ).fetch(url.href, {
        method: request.method,
        redirect: 'manual',
        headers: [...request.headers.entries()],
        body,
      });

      response = new Response(await objectResponse.arrayBuffer(), {
        status: objectResponse.status,
        headers: [...objectResponse.headers.entries()],
      });
    }
  }

  const headers = new Headers(response.headers);

  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');

  if (
    env.JOIN_WEBSITE_RETURN_URL
    && request.headers.get('Origin')
    === new URL(env.JOIN_WEBSITE_RETURN_URL).origin
  ) {
    headers.set(
      'Access-Control-Allow-Origin',
      new URL(env.JOIN_WEBSITE_RETURN_URL).origin,
    );

    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return new Response(response.body, { status: response.status, headers });
}

async function routingCode(request: Request): Promise<string> {
  try {
    const body = await readBody(request.clone());

    return typeof body.code === 'string' ? body.code : '';
  } catch {
    return '';
  }
}

function routingSession(request: Request): string {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('__Host-shoal-session='))
    ?.slice('__Host-shoal-session='.length)
    ?? request.headers.get('Authorization')?.replace(/^Session /, '')
    ?? '';
}
