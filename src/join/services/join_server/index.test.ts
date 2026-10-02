import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const origin = 'https://site.example';
const flowId = 'a'.repeat(43);
const sessionId = `${flowId}.${'b'.repeat(43)}`;
const csrf = 'c'.repeat(43);

async function runtime() {
  return new Miniflare(
    convertV4MiniflareOptions({
      name: 'join-runtime-test',
      unsafeInspectDurableObjects: true,
      modules: true,
      script: await readFile('.worker-build/worker.js', 'utf8'),
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: {
        JOIN_FLOWS: { className: 'JoinFlow', useSQLite: true },
      },
      bindings: {
        GITHUB_APP_ID: '1',
        GITHUB_APP_SLUG: 'shoal',
        GITHUB_APP_CLIENT_ID: 'client',
        GITHUB_APP_CLIENT_SECRET: 'transient-client-secret',
        GITHUB_APP_PRIVATE_KEY: 'not-used-in-boundary-tests',
        JOIN_SERVICE_ORIGIN: 'https://service.example',
        JOIN_WEBSITE_RETURN_URL: `${origin}/join/`,
      },
    }),
  );
}

async function seed(mf: Miniflare, overrides: object = {}) {
  const ns = await mf.getDurableObjectNamespace('JOIN_FLOWS');

  await ns
    .get(ns.idFromName(flowId))
    .fetch('https://service.example/api/status', {
      headers: { Origin: origin },
    });

  const storage = await mf.unsafeGetDurableObjectStorage(
    'join-runtime-test',
    'JoinFlow',
    { name: flowId },
  );

  const flow = {
    session: {
      identity: { id: 1, login: 'reviewer', type: 'User' },
      id: sessionId,
      csrf,
      expires: Date.now() + 1800000,
      busy: false,
      handoff: { code: `${flowId}.handoff`, expires: Date.now() + 60000 },
      ...overrides,
    },
  };

  await storage.exec(
    'INSERT INTO flow (id, value) VALUES (1, ?) '
    + 'ON CONFLICT(id) DO UPDATE SET value = excluded.value',
    JSON.stringify(flow),
  );

  return storage;
}

function api(
  mf: Miniflare,
  path: string,
  body: object,
  headers: Record<string, string> = {},
) {
  return mf.dispatchFetch(`https://service.example${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Session ${sessionId}`,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('OAuth state persists across eviction; callback binding/cancel/replay', async () => {
  const mf = await runtime();

  try {
    const started = await mf.dispatchFetch(
      'https://service.example/auth/start',
      { redirect: 'manual' },
    );

    const location = new URL(started.headers.get('Location') ?? '');
    const state = location.searchParams.get('state');
    const binding = started.headers.get('Set-Cookie')?.split(';')[0];

    assert.equal(started.status, 302);
    assert.equal(location.origin, 'https://github.com');
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');

    assert.match(
      started.headers.get('Set-Cookie') ?? '',
      /Secure; HttpOnly; SameSite=Lax/,
    );

    assert.ok(state && binding);

    await mf.unsafeEvictDurableObject('join-runtime-test', 'JoinFlow', {
      name: state,
    });

    const cancelled = await mf.dispatchFetch(
      `https://service.example/auth/callback?state=${state}&error=access_denied`,
      { headers: { Cookie: binding } },
    );

    assert.equal(cancelled.status, 200);
    assert.match(await cancelled.text(), /shoal-auth-cancelled/);

    assert.equal(
      (
        await mf.dispatchFetch(
          `https://service.example/auth/callback?state=${state}&error=access_denied`,
          { headers: { Cookie: binding } },
        )
      ).status,
      400,
    );

    const fresh = await mf.dispatchFetch('https://service.example/auth/start', {
      redirect: 'manual',
    });

    const deniedState = new URL(
      fresh.headers.get('Location') ?? '',
    ).searchParams.get('state');

    assert.equal(
      (
        await mf.dispatchFetch(
          `https://service.example/auth/callback?state=${deniedState}&error=access_denied`,
          { headers: { Cookie: '__Host-shoal-auth=attacker' } },
        )
      ).status,
      400,
    );
  } finally {
    await mf.dispose();
  }
});

test('SQLite sessions survive eviction; CORS/CSRF/handoff/logout', async () => {
  const mf = await runtime();

  try {
    const storage = await seed(mf);

    const preflight = await mf.dispatchFetch(
      'https://service.example/api/inspect',
      { method: 'OPTIONS', headers: { Origin: origin } },
    );

    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);

    assert.match(
      preflight.headers.get('Access-Control-Allow-Headers') ?? '',
      /Authorization/,
    );

    assert.equal(
      (
        await mf.dispatchFetch('https://service.example/api/inspect', {
          method: 'OPTIONS',
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );

    await mf.unsafeEvictDurableObject('join-runtime-test', 'JoinFlow', {
      name: flowId,
    });

    assert.equal(
      (
        await api(
          mf,
          '/api/session',
          { code: `${flowId}.handoff` },
          { Origin: 'https://evil.example' },
        )
      ).status,
      403,
    );

    const redeemed = await api(mf, '/api/session', {
      code: `${flowId}.handoff`,
    });

    const session = (await redeemed.json()) as {
      session: string;
      csrfToken: string;
    };

    assert.equal(redeemed.status, 200);
    assert.equal(session.session, sessionId);
    assert.equal(session.csrfToken, csrf);
    assert.equal(redeemed.headers.get('Access-Control-Allow-Origin'), origin);

    assert.equal(
      (await api(mf, '/api/session', { code: `${flowId}.handoff` })).status,
      400,
    );

    assert.equal(
      (await api(mf, '/api/logout', {}, { 'X-CSRF-Token': 'attacker' })).status,
      403,
    );

    assert.equal((await api(mf, '/api/logout', {})).status, 200);
    assert.deepEqual(await storage.exec('SELECT value FROM flow'), []);
    assert.equal((await api(mf, '/api/logout', {})).status, 401);
  } finally {
    await mf.dispose();
  }
});

test('Workerd rejects expiry, concurrency, and browser target injection', async () => {
  const mf = await runtime();

  try {
    const storage = await seed(mf, {
      plan: {
        id: 'expired',
        kind: 'station',
        value: {},
        expires: Date.now() - 1,
      },
    });

    assert.equal(
      (await api(mf, '/api/execute', { planId: 'expired' })).status,
      400,
    );

    assert.equal(
      (await api(mf, '/api/inspect', { repositoryId: 99 })).status,
      400,
    );

    await seed(mf, {
      busy: true,
      job: {
        id: 'job',
        status: 'running',
        progress: {
          completed: 1,
          total: 4,
          verifiedOperations: ['enable_issues'],
        },
      },
    });

    await mf.unsafeEvictDurableObject('join-runtime-test', 'JoinFlow', {
      name: flowId,
    });

    assert.equal(
      (await api(mf, '/api/execute', { planId: 'anything' })).status,
      409,
    );

    const status = await mf.dispatchFetch(
      'https://service.example/api/status?jobId=job',
      { headers: { Origin: origin, Authorization: `Session ${sessionId}` } },
    );

    assert.equal(status.status, 200);

    assert.equal(
      ((await status.json()) as { progress: { completed: number } }).progress
        .completed,
      1,
    );

    assert.ok(
      !JSON.stringify(await storage.exec('SELECT value FROM flow')).includes(
        'transient-client-secret',
      ),
    );

    await seed(mf, { expires: Date.now() - 1 });
    assert.equal((await api(mf, '/api/logout', {})).status, 401);
  } finally {
    await mf.dispose();
  }
});
