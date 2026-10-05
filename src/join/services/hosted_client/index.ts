import { JoinError } from '../join_client';
import type { Session } from '../join_client';
import type { HostedMode, HostedSettings } from '../hosted_settings';

export function hostedClient(serviceUrl: string) {
  const base = new URL(serviceUrl);

  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Hosted settings require a secure service URL.');
  }

  const request = async <T>(
    path: string, session: Session, body: unknown,
  ): Promise<T> => {
    const response = await fetch(new URL(path, base), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Session ${session.session}`,
        'X-CSRF-Token': session.csrfToken,
      },
      body: JSON.stringify(body),
    });

    const value = await response.json();

    if (!response.ok) {
      throw new JoinError(
        value.error?.message ?? 'Could not update Hosted settings.',
        value.error?.code ?? 'REQUEST_FAILED',
      );
    }

    return value as T;
  };

  return {
    inspect: (session: Session) =>
      request<HostedSettings>('/api/hosted/inspect', session, {}),
    mode: (session: Session, change: {
      repositoryId: number; mode: HostedMode; confirmed: boolean;
    }) =>
      request<HostedSettings>('/api/hosted/mode', session, change),
    repair: (session: Session, repositoryId: number) =>
      request<HostedSettings>('/api/hosted/repair', session, { repositoryId }),
    connect: async (session: Session, repositoryId: number) => {
      const value = await request<{ authorizationUrl: string }>(
        '/api/hosted/connect', session, { repositoryId, confirmed: true },
      );

      const url = new URL(value.authorizationUrl);

      const state = url.searchParams.get('state') ?? '';
      const ticket = url.searchParams.get('ticket') ?? '';

      const binding = /^([1-9]\d{0,15})\.([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/
        .exec(state);

      const expected = url.origin === base.origin
        && url.pathname === '/hosted/auth/start'
        && !url.username && !url.password && !url.hash
        && url.searchParams.size === 2
        && url.searchParams.getAll('state').length === 1
        && url.searchParams.getAll('ticket').length === 1
        && /^[A-Za-z0-9_-]{43}$/.test(ticket)
        && binding?.[1] === String(repositoryId)
        && binding?.[2] === String(session.identity.id);

      if (!expected) {
        throw new Error('The service returned an unexpected authorization destination.');
      }

      return url.href;
    },
    disconnect: (session: Session, repositoryId: number) =>
      request<HostedSettings>('/api/hosted/disconnect', session, { repositoryId }),
  };
}
