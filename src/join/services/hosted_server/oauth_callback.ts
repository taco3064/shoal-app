import type { HostedEnvironment } from './config';
import { grantOperation } from './grants';
import { GrantError, isGrantErrorCode } from '../hosted_grant';

function browserCookie(request: Request): string {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('__Host-shoal-hosted='))
    ?.slice('__Host-shoal-hosted='.length) ?? '';
}

function page(env: HostedEnvironment, connected: boolean, failure: string): Response {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));

  const origin = JSON.stringify(new URL(env.JOIN_WEBSITE_RETURN_URL).origin)
    .replace(/</g, '\\u003c');

  const result = JSON.stringify({ type: 'shoal-hosted-auth', connected });
  const diagnostic = connected ? '' : `<p>Reference: ${failure}</p>`;

  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Shoal recurring authorization</title><p>${connected ? 'Recurring authorization connected.' : 'Recurring authorization was not completed.'} You may close this window.</p>${diagnostic}<script nonce="${nonce}">if(window.opener){window.opener.postMessage(${result},${origin});window.close()}</script></html>`, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
        'Set-Cookie': '__Host-shoal-hosted=; Secure; HttpOnly; '
          + 'SameSite=Lax; Path=/; Max-Age=0',
      },
    });
}

export function createHostedCallbackHandler(operation = grantOperation) {
  return async function handle(request: Request,
    env: HostedEnvironment): Promise<Response> {
    const url = new URL(request.url);
    const state = url.searchParams.get('state') ?? '';
    const match = /^([1-9]\d{0,15})\.([1-9]\d{0,15})\.([A-Za-z0-9_-]{43})$/.exec(state);
    const code = url.searchParams.get('code') ?? '';
    const cookie = browserCookie(request);
    let connected = false;
    let failure = 'GRANT_AUTH_STATE';

    if (request.method === 'GET' && url.pathname === '/hosted/auth/callback'
      && match && !url.searchParams.has('error')
      && code.length > 0 && code.length <= 1024 && /^[A-Za-z0-9_-]{43}$/.test(cookie)) {
      try {
        await operation(env, { repositoryId: match[1], reviewerId: match[2] },
          'callback', { state, browserBinding: cookie, code });

        connected = true;
      } catch (error) {
        // Only allowlisted categories cross this boundary, never upstream text.
        failure = error instanceof GrantError && isGrantErrorCode(error.code)
          ? error.code
          : 'GRANT_UNAVAILABLE';
      }
    }

    return page(env, connected, failure);
  };
}

export const handleHostedCallback = createHostedCallbackHandler();
