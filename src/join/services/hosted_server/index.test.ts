import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { Miniflare, Request } from 'miniflare';

const code = buildSync({ stdin: { resolveDir: process.cwd(), contents: `
import { createHostedSessionHandler } from './src/join/services/hosted_server/session.ts';
import { createHostedCallbackHandler } from './src/join/services/hosted_server/oauth_callback.ts';
import { createHostedStartHandler } from './src/join/services/hosted_server/oauth_start.ts';
import { grantOperation } from './src/join/services/hosted_server/grants.ts';
import { GitHubError } from './src/join/services/github_join/index.ts';
const settings = {membership:true,repository:{id:200},authorizationAvailable:true};
const env = {JOIN_WEBSITE_RETURN_URL:'https://site.test/join/',
  JOIN_SERVICE_ORIGIN:'https://join.test'};
let operations = [];
const grant = async (env,binding,operation,input) => {
  operations.push({binding,operation,input});
  if (input?.code?.startsWith('failure-')) {
    return grantOperation({...env, GITHUB_APP_PRIVATE_KEY:'',
      HOSTED_OAUTH_CLIENT_ID:'test', HOSTED_OAUTH_CLIENT_SECRET:'secret-marker',
      HOSTED_GRANT_ENCRYPTION_KEY:'k'.repeat(32),
      HOSTED_GRANTS:{idFromName:value=>value,get:()=>({fetch:async()=>
        Response.json({error:{code:input.code.slice(8),message:'secret-marker'}},
          {status:403})})}},binding,operation,input);
  }
  const state = input?.state ?? '200.100.'+'a'.repeat(43);
  return {authorizationUrl:'https://github.com/login/oauth/authorize?state='+state,
    browserBinding:'a'.repeat(43),state,launchTicket:'c'.repeat(43)};
};
const service = {
  inspect:async () => settings,
  configure:async (identity,id,mode,confirmed) => ({id,mode,confirmed}),
  repair:async () => {throw new GitHubError(0,
    {pathClass:'repository_actions',failure:'transport'});},
};
const session = createHostedSessionHandler({service:()=>service,grant});
const callback = createHostedCallbackHandler(grant);
const start = createHostedStartHandler(grant);
export default {async fetch(request) {
  operations = [];
  const url = new URL(request.url);
  settings.repository.id = url.searchParams.has('stale') ? 201 : 200;
  const response = url.pathname === '/hosted/auth/start'
    ? await start(request,env)
    : url.pathname.startsWith('/hosted/auth')
    ? await callback(request,env)
    : await session(request,env,{id:100,type:'User',login:'reviewer',userToken:'private'},
      'server-session');
  const headers = new Headers(response.headers);
  headers.set('X-Test-Calls',JSON.stringify(operations));
  return new Response(response.body,{status:response.status,headers});
}};
` }, bundle: true, write: false, format: 'esm', platform: 'node',
external: ['cloudflare:workers'], target: 'es2022' }).outputFiles[0].text;

async function worker() {
  const runtime = new Miniflare({ workers: [{ config: { name: 'hosted-test',
    compatibilityDate: '2026-10-05', compatibilityFlags: ['nodejs_compat'],
    manifest: { mainModule: 'worker.mjs', modules: {
      'worker.mjs': { type: 'esm', contents: code },
    } },
  } }] });

  return runtime;
}

function request(path: string, body: object) {
  return new Request(`https://join.test${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('Hosted consent binds node and keeps browser credential-free', async () => {
  const runtime = await worker();

  try {
    const response = await runtime.dispatchFetch(request('/api/hosted/connect', {
      repositoryId: 200, confirmed: true,
    }));

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      authorizationUrl: `https://join.test/hosted/auth/start?state=200.100.${'a'.repeat(43)}`
        + `&ticket=${'c'.repeat(43)}`,
    });

    assert.equal(response.headers.get('Set-Cookie'), null);

    const calls = JSON.parse(response.headers.get('X-Test-Calls') ?? '[]');

    assert.deepEqual(calls, [{ binding: { repositoryId: '200', reviewerId: '100' },
      operation: 'begin', input: { sessionId: 'server-session' } }]);
  } finally {
    await runtime.dispose();
  }
});

test('Hosted routes refuse stale node and unsafe requests', async () => {
  const runtime = await worker();

  try {
    const cases = [
      request('/api/hosted/connect?stale', { repositoryId: 200, confirmed: true }),
      request('/api/hosted/connect', { repositoryId: 200 }),
      request('/api/hosted/disconnect', { repositoryId: 200, token: 'forbidden' }),
      request('/api/hosted/inspect', { extra: true }),
      new Request('https://join.test/api/hosted/connect'),
    ];

    for (const input of cases) {
      const response = await runtime.dispatchFetch(input);

      assert.ok(response.status >= 400);
      assert.equal(response.headers.get('X-Test-Calls'), '[]');
    }
  } finally {
    await runtime.dispose();
  }
});

test('OAuth callback binds cookie and sends only fixed outcome to exact Website origin',
  async () => {
    const runtime = await worker();
    const state = `200.100.${'b'.repeat(43)}`;

    try {
      const response = await runtime.dispatchFetch(
        `https://join.test/hosted/auth/callback?state=${state}&code=private-code`, {
          headers: { Cookie: `__Host-shoal-hosted=${'a'.repeat(43)}` },
        });

      const html = await response.text();

      assert.match(html, /"type":"shoal-hosted-auth","connected":true/);
      assert.match(html, /"https:\/\/site.test"/);
      assert.ok(!html.includes('private-code'));
      assert.ok(!html.includes(state));

      assert.match(response.headers.get('Content-Security-Policy') ?? '',
        /default-src 'none'; script-src 'nonce-/);

      const missing = await runtime.dispatchFetch(
        `https://join.test/hosted/auth/callback?state=${state}&code=private-code`,
      );

      assert.match(await missing.text(), /"connected":false/);
      assert.equal(missing.headers.get('X-Test-Calls'), '[]');
    } finally {
      await runtime.dispose();
    }
  });

test('top-level bootstrap sets binding cookie and redirects only to GitHub', async () => {
  const runtime = await worker();
  const state = `200.100.${'b'.repeat(43)}`;

  try {
    const response = await runtime.dispatchFetch(
      `https://join.test/hosted/auth/start?state=${state}&ticket=${'c'.repeat(43)}`,
      { redirect: 'manual' },
    );

    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('Location')!);

    assert.equal(location.origin, 'https://github.com');
    assert.equal(location.pathname, '/login/oauth/authorize');
    assert.equal(location.searchParams.get('state'), state);

    assert.match(response.headers.get('Set-Cookie') ?? '',
      /__Host-shoal-hosted=.*Secure; HttpOnly; SameSite=Lax; Path=\//);

    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    const calls = JSON.parse(response.headers.get('X-Test-Calls') ?? '[]');

    assert.deepEqual(calls, [{ binding: { repositoryId: '200', reviewerId: '100' },
      operation: 'launch', input: { state, launchTicket: 'c'.repeat(43) } }]);

    const rejected = await runtime.dispatchFetch(
      `https://join.test/hosted/auth/start?state=${state}&ticket=invalid`,
      { redirect: 'manual' },
    );

    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get('Set-Cookie'), null);
    assert.equal(rejected.headers.get('X-Test-Calls'), '[]');
  } finally {
    await runtime.dispose();
  }
});

test('callback carries only allowlisted failure categories through the grant boundary',
  async () => {
    const runtime = await worker();
    const state = `200.100.${'b'.repeat(43)}`;

    try {
      for (const code of ['GRANT_CLIENT_CONFIG', 'GRANT_AUTH_STATE',
        'GRANT_RECONSENT', 'secret-marker']) {
        const response = await runtime.dispatchFetch(
          `https://join.test/hosted/auth/callback?state=${state}&code=failure-${code}`, {
            headers: { Cookie: `__Host-shoal-hosted=${'a'.repeat(43)}` },
          });

        const html = await response.text();
        const expected = code === 'secret-marker' ? 'GRANT_UNAVAILABLE' : code;

        assert.ok(html.includes(`Reference: ${expected}`));
        assert.ok(!html.includes('secret-marker'));
        assert.ok(!html.includes(state));
        assert.ok(!html.includes('failure-'));
        assert.match(html, /"connected":false/);
      }
    } finally {
      await runtime.dispose();
    }
  });

test('Hosted mutation preserves sanitized upstream failure classification', async () => {
  const runtime = await worker();

  try {
    const response = await runtime.dispatchFetch(request('/api/hosted/repair', {
      repositoryId: 200,
    }));

    assert.equal(response.status, 502);

    const result = await response.json() as { error: {
      code: string; failure: string; pathClass: string;
    }; };

    assert.equal(result.error.code, 'GITHUB_UPSTREAM_FAILED');
    assert.equal(result.error.failure, 'transport');
    assert.equal(result.error.pathClass, 'repository_actions');
  } finally {
    await runtime.dispose();
  }
});
