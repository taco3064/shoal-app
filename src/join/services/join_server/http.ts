import { readBody } from './body';
import type { AuthIdentity } from './auth';
import { handleAuth } from './auth';
import type { JoinConfig } from './config';
import { plan, savePlan, stoppedJob } from './execution';
import {
  equalSecret,
  opaqueId,
  type DurableFlow,
  type FlowStorage,
} from './sessions';

export interface JoinAdapter {
  identity(token: string): Promise<AuthIdentity>;
  inspect(identity: AuthIdentity, previous?: unknown): Promise<unknown>;
  publicInspection(inspection: unknown): object;
  startExecution(inspection: unknown): unknown;
  executeStep(
    identity: AuthIdentity,
    checkpoint: unknown,
    progress: (value: object) => Promise<void>,
  ): Promise<{ done: boolean; checkpoint: unknown; result: object }>;
  preparePolicy(
    identity: AuthIdentity,
    inspection: unknown,
    input: { kind: 'default' | 'custom' | 'keep'; content?: string },
  ): Promise<unknown>;
  publicPolicy(plan: unknown): object;
  executePolicy(
    identity: AuthIdentity,
    plan: unknown,
    progress: (value: object) => Promise<void>,
  ): Promise<object>;
}

export function json(status: number, value: object): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function exactFields(body: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(body).some((key) => !fields.includes(key))) {
    throw new Error('Unsupported request field');
  }
}

export class JoinHttp {
  constructor(
    private options: {
      config: JoinConfig;
      adapter: JoinAdapter;
      flow: DurableFlow;
      storage: FlowStorage;
    },
  ) {}

  private persist(): Promise<void> {
    return this.options.storage.write(this.options.flow);
  }

  async handle(request: Request): Promise<Response> {
    const { config, adapter, flow } = this.options;
    const url = new URL(request.url);

    const auth = await handleAuth({
      request,
      config,
      flow,
      persist: () => this.persist(),
      identity: (token) => adapter.identity(token),
    });

    if (auth) {
      return auth;
    }

    if (request.headers.get('Origin') !== config.websiteOrigin) {
      return json(403, {
        error: { code: 'ORIGIN_DENIED', message: 'Untrusted origin' },
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type,Authorization,X-CSRF-Token',
        },
      });
    }

    if (url.pathname === '/api/session' && request.method === 'POST') {
      const body = await readBody(request);

      exactFields(body, ['code']);

      const session = flow.session;
      const handoff = session?.handoff;

      if (session) {
        delete session.handoff;
        await this.persist();
      }

      if (
        !session
        || !handoff
        || handoff.expires <= Date.now()
        || session.expires <= Date.now()
        || typeof body.code !== 'string'
        || !equalSecret(body.code, handoff.code)
      ) {
        throw new Error('Invalid session handoff');
      }

      return json(200, {
        authenticated: true,
        session: session.id,
        csrfToken: session.csrf,
        identity: session.identity,
      });
    }

    const authorization = request.headers.get('Authorization') ?? '';
    const session = flow.session;

    if (
      !session
      || session.expires <= Date.now()
      || !authorization.startsWith('Session ')
      || !equalSecret(authorization.slice(8), session.id)
    ) {
      return json(401, {
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Authorize with GitHub again.',
        },
      });
    }

    if (
      request.method === 'POST'
      && !equalSecret(request.headers.get('X-CSRF-Token') ?? '', session.csrf)
    ) {
      return json(403, {
        error: { code: 'CSRF_DENIED', message: 'Invalid request nonce' },
      });
    }

    if (url.pathname === '/api/status' && request.method === 'GET') {
      if (
        !session.job
        || !equalSecret(session.job.id, url.searchParams.get('jobId') ?? '')
      ) {
        throw new Error('Unknown job');
      }

      return json(200, session.job);
    }

    if (request.method !== 'POST') {
      return json(404, {
        error: { code: 'NOT_FOUND', message: 'Unknown operation' },
      });
    }

    const body = await readBody(request);

    if (session.busy) {
      return json(409, {
        error: {
          code: 'OPERATION_RUNNING',
          message: 'Wait for the current operation.',
        },
      });
    }

    if (url.pathname === '/api/logout') {
      exactFields(body, []);
      await this.options.storage.clear();
      delete flow.session;

      return json(200, { authenticated: false });
    }

    if (url.pathname === '/api/inspect') {
      exactFields(body, []);

      const previous = session.plan?.kind === 'station'
        ? session.plan.value
        : session.plan?.kind === 'policy'
          ? (session.plan.value as { inspection?: unknown }).inspection
          : undefined;

      const inspection = await adapter.inspect(session.identity, previous);
      const planId = savePlan(session, 'station', inspection);

      delete session.job;
      delete session.execution;
      session.busy = false;

      await this.persist();

      return json(200, { ...adapter.publicInspection(inspection), planId });
    }

    if (url.pathname === '/api/policy/plan') {
      exactFields(body, ['planId', 'choice', 'content']);

      const held = plan(session, body.planId, 'station');

      if (
        body.choice !== 'default'
        && body.choice !== 'custom'
        && body.choice !== 'keep'
      ) {
        throw new Error('Invalid policy choice');
      }

      if (body.choice === 'custom' && typeof body.content !== 'string') {
        throw new Error('Custom policy bytes required');
      }

      const policy = await adapter.preparePolicy(session.identity, held.value, {
        kind: body.choice,
        content: typeof body.content === 'string' ? body.content : undefined,
      });

      const planId = savePlan(session, 'policy', policy);

      await this.persist();

      return json(200, { ...adapter.publicPolicy(policy), planId });
    }

    if (
      url.pathname === '/api/execute'
      || url.pathname === '/api/policy/confirm'
    ) {
      exactFields(body, ['planId']);

      const kind = url.pathname === '/api/execute' ? 'station' : 'policy';
      const held = plan(session, body.planId, kind);

      const publicPlan
        = kind === 'station'
          ? (adapter.publicInspection(held.value) as { operations: string[] })
          : (adapter.publicPolicy(held.value) as { noop: boolean });

      const total
        = 'operations' in publicPlan
          ? publicPlan.operations.length
          : publicPlan.noop
            ? 0
            : 1;

      delete session.plan;
      session.busy = true;

      session.job = {
        id: opaqueId(),
        status: 'running',
        progress: { completed: 0, total, verifiedOperations: [] },
      };

      session.execution = {
        kind,
        value:
          kind === 'station' ? adapter.startExecution(held.value) : held.value,
      };

      await this.persist();
      await this.options.storage.schedule();

      return json(202, { jobId: session.job.id });
    }

    return json(404, {
      error: { code: 'NOT_FOUND', message: 'Unknown operation' },
    });
  }

  async step(): Promise<void> {
    const session = this.options.flow.session;

    if (!session?.execution || !session.busy) {
      return;
    }

    const { kind, value } = session.execution;
    const job = session.job;

    if (!job) {
      return;
    }

    const progress = async (update: object): Promise<void> => {
      job.progress = update;
      await this.persist();
    };

    try {
      const { adapter } = this.options;
      let result: object;

      if (kind === 'station') {
        const step = await adapter.executeStep(
          session.identity,
          value,
          progress,
        );

        session.execution.value = step.checkpoint;
        await this.persist();

        if (!step.done) {
          await this.options.storage.schedule();

          return;
        }

        result = step.result;
      } else {
        result = await adapter.executePolicy(session.identity, value, progress);
      }

      const operations
        = (result as { operations?: { state: string }[] }).operations ?? [];

      job.status = operations.some((operation) => operation.state === 'failed')
        ? 'failed'
        : operations.some((operation) => operation.state === 'blocked')
          ? 'blocked'
          : 'complete';

      job.result = result;
    } catch (error) {
      stoppedJob(job, error);
    } finally {
      if (job.status !== 'running') {
        session.busy = false;
        delete session.execution;
      }

      await this.persist();
    }
  }
}
