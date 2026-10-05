import type { HostedEnvironment } from './config';
import { grantOperation } from './grants';

export function createHostedStartHandler(operation = grantOperation) {
  return async function handle(request: Request,
    env: HostedEnvironment): Promise<Response> {
    const url = new URL(request.url);
    const state = url.searchParams.get('state') ?? '';
    const ticket = url.searchParams.get('ticket') ?? '';
    const match = /^([1-9]\d{0,15})\.([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/.exec(state);

    const headers = {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'default-src \'none\'; base-uri \'none\'; '
        + 'frame-ancestors \'none\'',
    };

    if (request.method !== 'GET' || url.protocol !== 'https:'
      || url.origin !== new URL(env.JOIN_SERVICE_ORIGIN).origin
      || url.pathname !== '/hosted/auth/start'
      || !match || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
      return new Response('Recurring authorization was not started.',
        { status: 403, headers });
    }

    try {
      const result = await operation<{
        authorizationUrl: string;
        browserBinding: string;
      }>(env, { repositoryId: match[1], reviewerId: match[2] },
        'launch', { state, launchTicket: ticket });

      const target = new URL(result.authorizationUrl);

      if (target.origin !== 'https://github.com'
        || target.pathname !== '/login/oauth/authorize'
        || target.searchParams.get('state') !== state
        || !/^[A-Za-z0-9_-]{43}$/.test(result.browserBinding)) {
        throw new Error('Authorization unavailable');
      }

      return new Response(null, { status: 302, headers: {
        ...headers,
        Location: target.href,
        'Set-Cookie': `__Host-shoal-hosted=${result.browserBinding}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      } });
    } catch {
      return new Response('Recurring authorization was not started.',
        { status: 403, headers });
    }
  };
}

export const handleHostedStart = createHostedStartHandler();
