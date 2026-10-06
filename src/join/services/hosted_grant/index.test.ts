import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { Miniflare, Response as WorkerResponse } from 'miniflare';
import { HostedGrantStore } from './store';
import { HostedOAuthClient } from './oauth';
import { GrantError, type GrantOAuth, type GrantRecord,
  type GrantTokens } from './types';

const binding = { reviewerId: '100', repositoryId: '200' };
const secret = 'separate-encryption-key-not-oauth-secret';

test('default OAuth transport works with native Workers fetch', async () => {
  const calls: string[] = [];

  const code = buildSync({ stdin: { resolveDir: process.cwd(), contents: `
    import { HostedOAuthClient } from './src/join/services/hosted_grant/oauth.ts';
    import { networkRoot } from './src/protocol/services/network_compatibility/index.ts';
    export default { async fetch() {
      const oauth = new HostedOAuthClient({clientId:'test-client',
        clientSecret:'test-secret',callbackUrl:'https://join.test/callback'});
      try {
        const first = await oauth.exchange('test-code','test-verifier');
        await oauth.verify(first.accessToken,
          {reviewerId:'100',repositoryId:String(networkRoot.repositoryId)});
        const rotated = await oauth.refresh(first.refreshToken);
        await oauth.revoke(rotated.accessToken);
        return Response.json({ok:true});
      } catch (error) {
        return Response.json({error:error.message},{status:500});
      }
    }};
  ` }, bundle: true, write: false, format: 'esm', platform: 'node',
  target: 'es2022' }).outputFiles[0].text;

  const runtime = new Miniflare({ workers: [{ config: {
    name: 'oauth-native-fetch', compatibilityDate: '2026-10-05',
    manifest: { mainModule: 'worker.mjs', modules: {
      'worker.mjs': { type: 'esm', contents: code },
    } },
  }, dev: { outboundService: { type: 'fetcher', handler: async (request) => {
    const path = new URL(request.url).pathname;

    calls.push(`${request.method} ${path}`);

    if (path === '/login/oauth/access_token') {
      const body = await request.json() as Record<string, string>;

      assert.equal(body.client_id, 'test-client');
      assert.equal(body.client_secret, 'test-secret');
      assert.ok(body.code === 'test-code' || body.refresh_token === 'refresh');

      return WorkerResponse.json({ access_token: 'access', refresh_token: 'refresh',
        token_type: 'bearer', scope: 'public_repo offline_access',
        expires_in: 28_800, refresh_token_expires_in: 15_552_000 });
    }

    if (request.method === 'DELETE') {
      return new WorkerResponse(null, { status: 204 });
    }

    return WorkerResponse.json(path === '/user'
      ? { id: 100, type: 'User' }
      : { id: Number(path.split('/').at(-1)), private: false,
          owner: { id: 100, type: 'User' } });
  } } },
  }] });

  try {
    const response = await runtime.dispatchFetch('https://test.local/');

    assert.equal(response.status, 200, await response.text());
    assert.equal(calls.length, 5);
    assert.equal(calls.at(-1), 'DELETE /applications/test-client/grant');
  } finally {
    await runtime.dispose();
  }
});

function harness() {
  let record: GrantRecord | undefined;
  let now = 1_800_000_000_000;
  let refreshCount = 0;

  const tokens = (): GrantTokens => ({
    accessToken: `access-${refreshCount}`,
    refreshToken: `refresh-${refreshCount}`,
    accessExpires: now + 28_800_000,
    refreshExpires: now + 15_552_000_000,
  });

  const oauth: GrantOAuth = {
    authorization: (state, challenge) => `${state}?challenge=${challenge}`,
    exchange: async () => tokens(),
    refresh: async () => {
      refreshCount++;

      return tokens();
    },
    verify: async () => {},
    revoke: async () => {},
  };

  const storage = {
    read: async () => record ? structuredClone(record) : undefined,
    write: async (value: GrantRecord) => { record = structuredClone(value); },
  };

  const create = () => new HostedGrantStore({ storage, oauth,
    encryptionKey: secret, now: () => now });

  const connect = async (grant: HostedGrantStore) => {
    const pending = await grant.begin(binding, 'authenticated-session');

    await grant.launch(binding, { state: pending.state,
      launchTicket: pending.launchTicket });

    await grant.callback(binding, { state: pending.state,
      browserBinding: pending.browserBinding, code: 'authorization-code' });
  };

  return { create, connect, oauth, storage,
    record: () => record,
    advance: (milliseconds: number) => { now += milliseconds; },
    refreshed: () => refreshCount };
}

test('encrypted grant survives session loss and object restart', async () => {
  const state = harness();

  await state.connect(state.create());
  const stored = JSON.stringify(state.record());

  assert.ok(!stored.includes('access-0'));
  assert.ok(!stored.includes('refresh-0'));
  assert.ok(!stored.includes('authenticated-session'));
  assert.equal((await state.create().status(binding)).status, 'connected');
  assert.equal((await state.create().token(binding)).token, 'access-0');

  await assert.rejects(state.create().token({ ...binding, reviewerId: '101' }),
    { code: 'GRANT_BINDING' });
});

test('OAuth state is single-use and browser-bound', async () => {
  const state = harness();
  const grant = state.create();
  const auth = await grant.begin(binding, 'session');

  await grant.launch(binding, { state: auth.state, launchTicket: auth.launchTicket });

  await assert.rejects(grant.callback(binding, { state: auth.state,
    browserBinding: 'another-browser', code: 'code' }), { code: 'GRANT_AUTH_STATE' });

  await assert.rejects(grant.callback(binding, { state: 'wrong-state',
    browserBinding: auth.browserBinding, code: 'code' }), { code: 'GRANT_AUTH_STATE' });

  assert.equal(state.record()?.pending?.state, auth.state);

  assert.equal((await grant.callback(binding, { state: auth.state,
    browserBinding: auth.browserBinding, code: 'code' })).status, 'connected');

  await assert.rejects(grant.callback(binding, { state: auth.state,
    browserBinding: auth.browserBinding, code: 'code' }), { code: 'GRANT_AUTH_STATE' });

  assert.equal((await grant.status(binding)).status, 'connected');
});

test('refresh is serialized and preserves verified identity', async () => {
  const state = harness();
  const grant = state.create();
  const verified: string[] = [];

  state.oauth.verify = async (token, identity) => {
    assert.deepEqual(identity, binding);
    verified.push(token);
  };

  await state.connect(grant);
  state.advance(28_600_000);
  const results = await Promise.all([grant.token(binding), grant.token(binding)]);

  assert.equal(state.refreshed(), 1);
  assert.ok(results.every((value) => value.token === 'access-1'));
  assert.deepEqual(verified, ['access-0', 'access-1', 'access-1']);
  assert.equal((await state.create().token(binding)).token, 'access-1');
});

test('ambiguous refresh fails closed until reconnect', async () => {
  const state = harness();
  const grant = state.create();

  await state.connect(grant);
  state.advance(28_600_000);

  state.oauth.refresh = async () => {
    throw new Error('secret upstream timeout');
  };

  await assert.rejects(grant.token(binding), { code: 'GRANT_RECONSENT' });
  assert.equal((await grant.status(binding)).status, 'refresh_ambiguous');
  assert.equal(state.record()?.sealed, undefined);
  await state.connect(grant);
  const interrupted = state.record()!;

  interrupted.refreshing = true;
  await state.storage.write(interrupted);
  await assert.rejects(state.create().token(binding), { code: 'GRANT_RECONSENT' });
});

test('revocation, expiry, disconnect and reconnect remain distinct', async () => {
  const state = harness();
  const grant = state.create();

  await state.connect(grant);

  state.oauth.verify = async () => {
    throw new GrantError('GRANT_REVOKED');
  };

  await assert.rejects(grant.token(binding), { code: 'GRANT_REVOKED' });
  assert.equal((await grant.status(binding)).status, 'revoked');

  state.oauth.verify = async () => {};

  await state.connect(grant);
  state.advance(15_552_000_001);
  assert.equal((await grant.status(binding)).status, 'expired');
  await assert.rejects(grant.token(binding), { code: 'GRANT_EXPIRED' });
  await state.connect(grant);

  state.oauth.revoke = async () => {
    throw new Error('unavailable');
  };

  assert.equal((await grant.disconnect(binding)).status, 'disconnected');
  assert.equal(state.record()?.sealed, undefined);
  await state.connect(grant);
  assert.equal((await grant.status(binding)).status, 'connected');
});

test('refresh stable Reviewer mismatch never releases rotated access token', async () => {
  const state = harness();
  const grant = state.create();

  await state.connect(grant);
  state.advance(28_600_000);

  state.oauth.verify = async () => {
    throw new GrantError('GRANT_BINDING');
  };

  await assert.rejects(grant.token(binding), { code: 'GRANT_BINDING' });
  assert.equal((await grant.status(binding)).status, 'reconsent_required');
});

test('OAuth uses separate explicit refreshable public scope with PKCE', () => {
  const oauth = new HostedOAuthClient({ clientId: 'separate-oauth-app',
    clientSecret: 'oauth-secret', callbackUrl: 'https://join.test/hosted/auth/callback' });

  const url = new URL(oauth.authorization('server-state', 'challenge'));

  assert.equal(url.searchParams.get('scope'), 'public_repo offline_access');
  assert.equal(url.searchParams.get('client_id'), 'separate-oauth-app');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'server-state');
});

test('OAuth verifies authoritative user and direct-fork binding', async () => {
  const { networkRoot } = await import('~app/protocol/services/network_compatibility');
  let ownerId = 100;
  let parentId: number = networkRoot.repositoryId;
  const paths: string[] = [];

  const oauth = new HostedOAuthClient({ clientId: 'oauth-app', clientSecret: 'secret',
    callbackUrl: 'https://join.test/hosted/auth/callback' }, async (input) => {
    const path = new URL(String(input)).pathname;

    paths.push(path);

    return Response.json(path === '/user'
      ? { id: 100, type: 'User' }
      : {
          id: 200, private: false, fork: true,
          owner: { id: ownerId, type: 'User' }, parent: { id: parentId },
        });
  });

  await oauth.verify('personal-token', binding);
  assert.deepEqual(paths, ['/user', '/repositories/200']);
  ownerId = 101;

  await assert.rejects(oauth.verify('personal-token', binding),
    { code: 'GRANT_BINDING' });

  ownerId = 100;
  parentId = 123;

  await assert.rejects(oauth.verify('personal-token', binding),
    { code: 'GRANT_BINDING' });
});

test('OAuth refuses non-expiring or unscoped credentials', async () => {
  let scoped = true;
  let expires = 28_800;

  const oauth = new HostedOAuthClient({ clientId: 'oauth-app', clientSecret: 'secret',
    callbackUrl: 'https://join.test/hosted/auth/callback' }, async () => Response.json({
    access_token: 'access', refresh_token: 'refresh', token_type: 'bearer',
    scope: scoped ? 'public_repo offline_access' : 'read:user',
    expires_in: expires, refresh_token_expires_in: 15_552_000,
  }));

  assert.equal((await oauth.exchange('code', 'verifier')).accessToken, 'access');
  scoped = false;
  await assert.rejects(oauth.exchange('code', 'verifier'), { code: 'GRANT_RECONSENT' });
  scoped = true;
  expires = 28_801;
  await assert.rejects(oauth.refresh('refresh'), { code: 'GRANT_RECONSENT' });
});

test('launch is one-use and required before callback', async () => {
  const state = harness();
  const grant = state.create();
  const pending = await grant.begin(binding, 'session');

  await assert.rejects(grant.launch(binding, { state: 'wrong-state',
    launchTicket: pending.launchTicket }), { code: 'GRANT_AUTH_STATE' });

  await assert.rejects(grant.launch(binding, { state: pending.state,
    launchTicket: 'wrong-ticket' }), { code: 'GRANT_AUTH_STATE' });

  const launch = await grant.launch(binding, {
    state: pending.state, launchTicket: pending.launchTicket,
  });

  assert.equal(launch.browserBinding, pending.browserBinding);

  await assert.rejects(grant.launch(binding, { state: pending.state,
    launchTicket: pending.launchTicket }), { code: 'GRANT_AUTH_STATE' });

  const unlaunched = await grant.begin(binding, 'another-session');

  await assert.rejects(grant.callback(binding, { state: unlaunched.state,
    browserBinding: unlaunched.browserBinding, code: 'code' }),
  { code: 'GRANT_AUTH_STATE' });

  const expired = await grant.begin(binding, 'session');

  state.advance(600_001);

  await assert.rejects(grant.launch(binding, { state: expired.state,
    launchTicket: expired.launchTicket }), { code: 'GRANT_AUTH_STATE' });
});

test('OAuth client failure never reflects upstream descriptions', async () => {
  const oauth = new HostedOAuthClient({ clientId: 'oauth-app', clientSecret: 'secret',
    callbackUrl: 'https://join.test/hosted/auth/callback' }, async () => Response.json({
    error: 'incorrect_client_credentials', error_description: 'secret-marker',
  }));

  await assert.rejects(oauth.exchange('code', 'verifier'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal((error as Error & { code: string }).code, 'GRANT_CLIENT_CONFIG');
    assert.ok(!error.message.includes('secret-marker'));

    return true;
  });
});
