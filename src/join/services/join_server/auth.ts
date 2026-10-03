import type { JoinConfig } from './config';
import { equalSecret, opaqueId, type DurableFlow } from './sessions';

export interface AuthIdentity {
  id: number;
  login: string;
  type: string;
}

export function cookie(request: Request, name: string): string {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  );
}

function callbackPage(config: JoinConfig, message: object): Response {
  const nonce = opaqueId();
  const payload = JSON.stringify(message).replace(/</g, '\\u003c');
  const origin = JSON.stringify(config.websiteOrigin).replace(/</g, '\\u003c');

  return new Response(
    `<!doctype html><title>Shoal authorization</title><p>Authorization finished. You may close this window.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${payload},${origin});window.close()}</script>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
        'Set-Cookie':
          '__Host-shoal-auth=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
      },
    },
  );
}

export async function handleAuth(options: {
  request: Request;
  config: JoinConfig;
  flow: DurableFlow;
  persist: () => Promise<void>;
  identity: (token: string) => Promise<AuthIdentity>;
  retainUserToken: (
    sessionId: string,
    token: string,
    expires: number,
  ) => Promise<void>;
}): Promise<Response | undefined> {
  const { request, config, flow, persist, identity, retainUserToken } = options;
  const url = new URL(request.url);

  if (
    request.method !== 'GET'
    || !['/auth/start', '/auth/callback'].includes(url.pathname)
  ) {
    return;
  }

  if (url.pathname === '/auth/start') {
    const state = url.searchParams.get('flow') ?? '';
    const binding = opaqueId();
    const verifier = opaqueId();

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(verifier),
    );

    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    flow.auth = { state, binding, verifier, expires: Date.now() + 600_000 };
    delete flow.session;
    await persist();

    const location = new URL('https://github.com/login/oauth/authorize');

    location.searchParams.set('client_id', config.clientId);

    location.searchParams.set(
      'redirect_uri',
      `${config.serviceOrigin}/auth/callback`,
    );

    location.searchParams.set('state', state);
    location.searchParams.set('code_challenge', challenge);
    location.searchParams.set('code_challenge_method', 'S256');

    return new Response(null, {
      status: 302,
      headers: {
        Location: location.href,
        'Set-Cookie': `__Host-shoal-auth=${binding}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`,
      },
    });
  }

  const pending = flow.auth;

  delete flow.auth;
  await persist();

  if (
    !pending
    || pending.expires <= Date.now()
    || !equalSecret(pending.state, url.searchParams.get('state') ?? '')
    || !equalSecret(pending.binding, cookie(request, '__Host-shoal-auth'))
  ) {
    throw new Error('Invalid or expired authorization state');
  }

  if (url.searchParams.has('error')) {
    return callbackPage(config, { type: 'shoal-auth-cancelled' });
  }

  const code = url.searchParams.get('code');

  if (!code) {
    throw new Error('Missing authorization code');
  }

  const exchange = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: `${config.serviceOrigin}/auth/callback`,
      code_verifier: pending.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const credentials = (await exchange.json()) as {
    access_token?: string;
    token_type?: string;
  };

  if (
    !exchange.ok
    || !credentials.access_token
    || credentials.token_type !== 'bearer'
  ) {
    throw new Error('GitHub authorization exchange failed');
  }

  const user = await identity(credentials.access_token);

  if (
    user.type !== 'User'
    || !Number.isSafeInteger(user.id)
    || user.id <= 0
    || !user.login
  ) {
    throw new Error('A Personal Account is required');
  }

  const id = `${pending.state}.${opaqueId()}`;
  const handoff = `${pending.state}.${opaqueId()}`;

  flow.session = {
    identity: { id: user.id, login: user.login, type: user.type },
    id,
    csrf: opaqueId(),
    expires: Date.now() + 1_800_000,
    handoff: { code: handoff, expires: Date.now() + 60_000 },
    busy: false,
  };

  await retainUserToken(id, credentials.access_token, flow.session.expires);

  await persist();

  return callbackPage(config, { type: 'shoal-auth', code: handoff });
}
