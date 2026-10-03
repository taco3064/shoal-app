import type { Job, PolicyPlan, Session, Snapshot } from './types';
import { inspectionView } from './inspection_view';
import { JoinError } from './errors';

export type { Identity, Inspection, Job, PolicyPlan, Session, Stage } from './types';
export { JoinError } from './errors';
export { resolveJoinServiceUrl } from './local_service_url';

type ServerJob = Omit<Job, 'result'> & {
  id?: string;
  result?: { inspection: Snapshot };
};

function publicJob(value: ServerJob): Job & { id?: string } {
  return {
    id: value.id,
    status: value.status,
    progress: value.progress,
    error: value.error,
    result: value.error
      ? new JoinError(
        value.error.message,
        value.error.code,
        value.error,
        value.result?.inspection,
      ).inspection
      : value.result ? inspectionView(value.result.inspection) : undefined,
  };
}

function opaqueId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function joinClient(serviceUrl: string) {
  const base = new URL(serviceUrl);

  if (
    base.protocol !== 'https:'
    && base.hostname !== 'localhost'
    && base.hostname !== '127.0.0.1'
  ) {
    throw new Error('Quick Web Join requires a secure service URL.');
  }

  const request = async <T>(
    path: string,
    session?: Session,
    body?: unknown,
  ): Promise<T> => {
    const response = await fetch(new URL(path, base), {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(session
          ? {
              Authorization: `Session ${session.session}`,
              'X-CSRF-Token': session.csrfToken,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const value = await response.json();

    if (!response.ok) {
      throw new JoinError(
        value.error?.message
        ?? 'The Join service could not complete this request.',
        value.error?.code ?? 'request_failed',
        value.error,
        value.inspection,
      );
    }

    return value as T;
  };

  return {
    origin: base.origin,
    get authUrl() {
      const url = new URL('/auth/start', base);

      url.searchParams.set('flow', opaqueId());

      return url.href;
    },
    session: (code: string) =>
      request<Session>('/api/session', undefined, { code }),
    restore: (session?: Session) =>
      request<Session>('/api/session/current', session),
    inspect: async (session: Session) =>
      inspectionView(await request<Snapshot>('/api/inspect', session, {})),
    execute: (session: Session, planId: string) =>
      request<{ jobId: string }>('/api/execute', session, { planId }),
    status: async (session: Session, jobId: string): Promise<Job> =>
      publicJob(
        await request<ServerJob>(
          `/api/status?jobId=${encodeURIComponent(jobId)}`,
          session,
        ),
      ),
    currentStatus: async (session: Session): Promise<Job & { id?: string }> =>
      publicJob(await request<ServerJob>('/api/status/current', session)),
    policy: async (
      session: Session,
      planId: string,
      choice: 'keep' | 'default' | 'custom',
      content?: string,
    ): Promise<PolicyPlan> => {
      const value = await request<{
        planId: string;
        content: string;
        noop: boolean;
        nodeHead: string;
      }>('/api/policy/plan', session, {
        planId,
        choice,
        ...(content === undefined ? {} : { content }),
      });

      return {
        planId: value.planId,
        content: value.content,
        changes: !value.noop,
        head: value.nodeHead,
      };
    },
    confirmPolicy: (session: Session, planId: string) =>
      request<{ jobId: string }>('/api/policy/confirm', session, { planId }),
    logout: (session: Session) => request<void>('/api/logout', session, {}),
  };
}
