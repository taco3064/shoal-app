import assert from 'node:assert/strict';
import test from 'node:test';
import { JoinError, joinClient } from './index';

const snapshot = {
  planId: 'inspected-plan',
  identity: { id: 21, login: 'reviewer' },
  repository: { id: 90, fullName: 'reviewer/station', defaultBranch: 'main' },
  rootOwner: false,
  rootHead: 'root-generation',
  nodeHead: 'node-generation',
  waiting: null,
  appAccess: true,
  issuesEnabled: false,
  actionsEnabled: true,
  managedFilesMatch: true,
  workflowActive: false,
  workflowSupported: true,
  platformBlocked: false,
  policy: {
    content: '# My Policy',
    defaultContent: '# Default',
    matchesDefault: false,
  },
  operations: ['enable_issues', 'enable_workflow'],
  ready: false,
};

test('client sends opaque session and exact confirmed plan', async (context) => {
  const requests: { url: string; init?: RequestInit }[] = [];

  context.mock.method(
    globalThis,
    'fetch',
    async (url: URL, init?: RequestInit) => {
      requests.push({ url: url.href, init });

      return Response.json(
        url.pathname === '/api/inspect' ? snapshot : { jobId: 'job' },
      );
    },
  );

  const client = joinClient('https://join.example/');

  const session = {
    session: 'opaque-session',
    csrfToken: 'csrf',
    identity: snapshot.identity,
  };

  const inspection = await client.inspect(session);

  assert.equal(inspection.node?.id, 90);
  assert.equal(inspection.policy?.current, '# My Policy');

  assert.deepEqual(
    inspection.operations.map((operation) => operation.id),
    snapshot.operations,
  );

  const station = inspection.stages.find((stage) => stage.id === 'station');
  const policy = inspection.stages.find((stage) => stage.id === 'policy');

  assert.equal(station?.state, 'current');
  assert.equal(policy?.state, 'waiting');
  assert.equal(policy?.action, undefined);

  assert.equal(
    station?.facts?.find((fact) => fact.label === 'Repository Actions')?.state,
    'complete',
  );

  assert.equal(
    station?.facts?.find((fact) => fact.label === 'Issues availability')?.state,
    'current',
  );

  await client.execute(session, inspection.planId);
  assert.equal(requests[1].init?.credentials, 'omit');
  assert.equal(requests[1].init?.body, '{"planId":"inspected-plan"}');

  assert.deepEqual(requests[1].init?.headers, {
    'Content-Type': 'application/json',
    Authorization: 'Session opaque-session',
    'X-CSRF-Token': 'csrf',
  });
});

test('client opens Policy only after station setup is verified', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      ...snapshot,
      issuesEnabled: true,
      actionsEnabled: true,
      workflowActive: true,
      operations: [],
      ready: true,
    }),
  );

  const client = joinClient('https://join.example/');

  const inspection = await client.inspect({
    session: 'session',
    csrfToken: 'csrf',
    identity: snapshot.identity,
  });

  const station = inspection.stages.find((stage) => stage.id === 'station');
  const policy = inspection.stages.find((stage) => stage.id === 'policy');
  const ready = inspection.stages.find((stage) => stage.id === 'ready');

  assert.equal(station?.state, 'complete');
  assert.equal(policy?.state, 'available');
  assert.equal(policy?.action, 'policy');
  assert.equal(ready?.state, 'complete');
});

test('client preserves partial verified progress and stale errors', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url: URL) => {
    if (url.pathname === '/api/status') {
      return Response.json({
        status: 'failed',
        progress: {
          completed: 1,
          total: 2,
          verifiedOperations: ['enable_issues'],
        },
        error: { code: 'STALE_PLAN', message: 'Concurrent branch change' },
      });
    }

    return Response.json(
      { error: { code: 'STALE_PLAN', message: 'Refresh first' } },
      { status: 409 },
    );
  });

  const client = joinClient('https://join.example/');

  const session = {
    session: 'session',
    csrfToken: 'csrf',
    identity: snapshot.identity,
  };

  const job = await client.status(session, 'job');

  assert.equal(job.status, 'failed');

  assert.deepEqual(job.progress, {
    completed: 1,
    total: 2,
    verifiedOperations: ['enable_issues'],
  });

  await assert.rejects(
    client.execute(session, 'stale'),
    (error: unknown) =>
      error instanceof JoinError && error.code === 'STALE_PLAN',
  );
});

test('client rejects insecure production origins', () => {
  assert.throws(() => joinClient('http://join.example/'), /secure service URL/);
});

test('client auth URL carries a fresh flow id for local popup routing', () => {
  const client = joinClient('http://127.0.0.1:8787/');
  const first = new URL(client.authUrl);
  const second = new URL(client.authUrl);

  assert.equal(first.origin, 'http://127.0.0.1:8787');
  assert.equal(first.pathname, '/auth/start');
  assert.match(first.searchParams.get('flow') ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.match(second.searchParams.get('flow') ?? '', /^[A-Za-z0-9_-]{43}$/);

  assert.notEqual(
    first.searchParams.get('flow'),
    second.searchParams.get('flow'),
  );
});
