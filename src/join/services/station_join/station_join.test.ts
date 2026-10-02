import { createPublicKey, createVerify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

import assert from 'node:assert/strict';
import test from 'node:test';

import { summaryWorkflowPath } from '~app/protocol/services/network_compatibility';
import { createStationJoinService } from './index';
import { githubFixture } from './test_github';

test('durable steps cannot activate drift under an unadmitted Root', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.rootFiles[summaryWorkflowPath] = 'unadmitted Root generation';

  const plan = await service.inspect(state.user);

  assert.equal(plan.platformBlocked, true);
  assert.deepEqual(plan.operations, ['enable_issues', 'enable_actions']);

  let checkpoint = {
    plan,
    inspection: plan,
    operations: plan.operations.map((name) => ({ name, state: 'queued' as const })),
  } as import('./types').ExecutionCheckpoint;

  for (const _name of plan.operations) {
    const step = await service.executeStep(state.user, checkpoint);

    checkpoint = step.checkpoint;
  }

  assert.equal(checkpoint.inspection.ready, false);
  assert.equal(state.node.has_issues, true);
  assert.equal(state.actions.enabled, true);
  assert.equal(state.workflow.state, 'disabled_fork');
  assert.equal(state.files[summaryWorkflowPath], 'drifted workflow');
  assert.equal(state.head, 'node-parent');

  assert.ok(
    !state.requests.some((request) =>
      request.method === 'PUT' && request.path.endsWith('/enable'),
    ),
  );
});

test('workflow read-back requires the exact enabled identity', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.replaceWorkflowAfterEnable = true;

  const result = await service.execute(
    'user-token',
    await service.inspect('user-token'),
  );

  assert.equal(result.completed, 3);
  assert.equal(result.operations[3].state, 'failed');
  assert.match(result.operations[3].error ?? '', /read-back/);
  assert.equal(state.workflow.id, 902);
  assert.equal(state.workflow.state, 'active');
});

test('Actions policy drift after enable acknowledgement is not verified', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.changeActionsPolicyOnEnable = true;

  const result = await service.execute(
    'user-token',
    await service.inspect('user-token'),
  );

  assert.equal(result.completed, 1);
  assert.equal(result.operations[1].state, 'failed');
  assert.match(result.operations[1].error ?? '', /read-back/);
  assert.equal(state.actions.enabled, true);
  assert.equal(state.actions.allowed_actions, 'all');
});

test('Root change during managed tree creation blocks branch advance', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.changeRootDuringTree = true;

  const result = await service.execute(
    'user-token',
    await service.inspect('user-token'),
  );

  assert.equal(result.completed, 2);
  assert.equal(result.operations[2].state, 'blocked');
  assert.equal(state.head, 'node-parent');

  assert.ok(
    !state.requests.some((request) =>
      request.path.endsWith('/git/refs/heads/main'),
    ),
  );
});

test('Root change during Policy tree creation blocks branch advance', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const displayed = await service.inspect('user-token');

  const plan = await service.preparePolicy('user-token', displayed, {
    kind: 'default',
  });

  state.changeRootDuringTree = true;

  const result = await service.executePolicy('user-token', plan);

  assert.equal(result.completed, 0);
  assert.equal(result.operations[0].state, 'blocked');
  assert.equal(state.head, 'node-parent');
  assert.equal(state.files['README.md'], '# My existing policy\n');

  assert.ok(
    !state.requests.some((request) =>
      request.path.endsWith('/git/refs/heads/main'),
    ),
  );
});

const origin = 'https://site.example';
const serviceOrigin = 'https://service.example';
const userToken = 'transient-oauth-user-token';
const clientSecret = 'private-client-secret';
type Session = { session: string; csrfToken: string };
type Plan = { planId: string; ready: boolean; operations: string[] };
type Job = {
  status: string;
  progress: { completed: number; total: number };
  result?: { completed: number; ready: boolean; operations: unknown[] };
};

async function runtime() {
  const fixture = githubFixture();
  const publicKey = createPublicKey(fixture.privateKey);
  let jwtChecks = 0;
  let exchanges = 0;

  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'join-positive-test',
    unsafeInspectDurableObjects: true,
    modules: true,
    script: await readFile('.worker-build/worker.js', 'utf8'),
    compatibilityDate: '2026-10-01',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { JOIN_FLOWS: { className: 'JoinFlow', useSQLite: true } },
    bindings: {
      GITHUB_APP_ID: '123',
      GITHUB_APP_SLUG: 'shoal',
      GITHUB_APP_CLIENT_ID: 'test-client',
      GITHUB_APP_CLIENT_SECRET: clientSecret,
      GITHUB_APP_PRIVATE_KEY: fixture.privateKey,
      JOIN_SERVICE_ORIGIN: serviceOrigin,
      JOIN_WEBSITE_RETURN_URL: `${origin}/join/`,
    },
    outboundService: async (request) => {
      const url = new URL(request.url);

      if (url.href === 'https://github.com/login/oauth/access_token') {
        const body = await request.json() as Record<string, string>;

        assert.equal(body.code, 'owner-authorized-test-code');
        assert.equal(body.client_secret, clientSecret);
        assert.equal(body.redirect_uri, `${serviceOrigin}/auth/callback`);
        assert.ok(body.code_verifier);
        exchanges++;

        return new Response(JSON.stringify({
          access_token: userToken,
          token_type: 'bearer',
        }));
      }

      assert.equal(url.origin, 'https://api.github.com');

      if (url.pathname.endsWith('/installation')
        || url.pathname.endsWith('/access_tokens')) {
        const jwt = (request.headers.get('Authorization') ?? '').slice(7);
        const [header, payload, signature] = jwt.split('.');

        assert.equal(
          createVerify('RSA-SHA256').update(`${header}.${payload}`).end()
            .verify(publicKey, Buffer.from(signature, 'base64url')),
          true,
        );

        assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString()).iss, '123');
        jwtChecks++;
      }

      return fixture.fetcher(request.url, {
        method: request.method,
        headers: [...request.headers.entries()],
        body: request.method === 'GET' ? undefined : await request.text(),
      });
    },
  }));

  return { mf, fixture, checks: () => ({ jwtChecks, exchanges }) };
}

function api(mf: Miniflare, session: Session, path: string, body: object) {
  return mf.dispatchFetch(`${serviceOrigin}${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Session ${session.session}`,
      'X-CSRF-Token': session.csrfToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function authorize(mf: Miniflare): Promise<{ session: Session; flowId: string }> {
  const started = await mf.dispatchFetch(`${serviceOrigin}/auth/start`, {
    redirect: 'manual',
  });

  assert.equal(started.status, 302);

  const location = new URL(started.headers.get('Location') ?? '');
  const flowId = location.searchParams.get('state') ?? '';
  const cookie = started.headers.get('Set-Cookie')?.split(';')[0] ?? '';

  await mf.unsafeEvictDurableObject('join-positive-test', 'JoinFlow', { name: flowId });

  const callback = await mf.dispatchFetch(
    `${serviceOrigin}/auth/callback?state=${flowId}&code=owner-authorized-test-code`,
    { headers: { Cookie: cookie } },
  );

  assert.equal(callback.status, 200, JSON.stringify(await callback.clone().text()));

  const html = await callback.text();
  const handoff = html.match(/"code":"([A-Za-z0-9_.-]+)"/)?.[1];

  assert.ok(handoff);
  assert.ok(!html.includes(userToken));

  const redeemed = await mf.dispatchFetch(`${serviceOrigin}/api/session`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: handoff }),
  });

  assert.equal(redeemed.status, 200);

  return { session: await redeemed.json() as Session, flowId };
}

async function finish(mf: Miniflare, session: Session, jobId: string): Promise<Job> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await mf.dispatchFetch(
      `${serviceOrigin}/api/status?jobId=${jobId}`,
      { headers: { Origin: origin, Authorization: `Session ${session.session}` } },
    );

    assert.equal(response.status, 200);

    const job = await response.json() as Job;

    if (job.status !== 'running') {
      return job;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Durable alarm job did not finish');
}

test('Worker authenticates and converges through alarms using PKCS1', async () => {
  const { mf, fixture, checks } = await runtime();

  try {
    const { session, flowId } = await authorize(mf);
    const inspected = await api(mf, session, '/api/inspect', {});

    assert.equal(inspected.status, 200);

    const plan = await inspected.json() as Plan;

    assert.equal(plan.operations.length, 4);
    assert.equal(plan.ready, false);
    assert.ok(!fixture.state.requests.some((request) => request.method === 'PATCH'));

    const launched = await api(mf, session, '/api/execute', { planId: plan.planId });

    assert.equal(launched.status, 202);

    const jobId = (await launched.json() as { jobId: string }).jobId;
    const job = await finish(mf, session, jobId);

    assert.equal(job.status, 'complete');
    assert.equal(job.result?.completed, 4);
    assert.equal(job.result?.ready, true);
    assert.equal(fixture.state.files['README.md'], '# My existing policy\n');
    assert.equal(fixture.state.files['notes.txt'], 'untouched');
    assert.equal(fixture.state.parent, 'node-parent');
    assert.ok(checks().jwtChecks > 0);
    assert.equal(checks().exchanges, 1);

    const storage = await mf.unsafeGetDurableObjectStorage(
      'join-positive-test', 'JoinFlow', { name: flowId },
    );

    const persisted = JSON.stringify(await storage.exec('SELECT value FROM flow'));

    for (const secret of [userToken, clientSecret, fixture.privateKey, 'installation-']) {
      assert.ok(!persisted.includes(secret));
    }

    await mf.unsafeEvictDurableObject('join-positive-test', 'JoinFlow', { name: flowId });

    const converged = await api(mf, session, '/api/inspect', {});
    const next = await converged.json() as Plan;

    assert.equal(next.ready, true);
    assert.deepEqual(next.operations, []);

    const before = fixture.state.requests.length;
    const noop = await api(mf, session, '/api/execute', { planId: next.planId });
    const noopId = (await noop.json() as { jobId: string }).jobId;
    const done = await finish(mf, session, noopId);

    assert.equal(done.status, 'complete');
    assert.equal(done.result?.completed, 0);
    assert.equal(done.result?.ready, true);

    assert.ok(!fixture.state.requests.slice(before).some((request) =>
      request.method !== 'GET' && !request.path.endsWith('/access_tokens'),
    ));

    assert.equal(
      fixture.state.requests.filter((request) => request.path === '/user').length, 1,
    );
  } finally {
    await mf.dispose();
  }
});
