import assert from 'node:assert/strict';
import test from 'node:test';

import { JoinHttp, type JoinAdapter } from './http';
import type { JoinConfig } from './config';
import type { DurableFlow, FlowStorage } from './sessions';

function handler(options: { expired?: boolean; token?: string } = {}) {
  const calls: unknown[] = [];

  const flow: DurableFlow = { session: {
    id: 'held-server-session', csrf: 'held-server-csrf', busy: false,
    identity: { id: 100, login: 'reviewer', type: 'User' },
    expires: Date.now() + (options.expired ? -1 : 60_000),
  } };

  const http = new JoinHttp({
    config: { websiteOrigin: 'https://site.test' } as JoinConfig,
    adapter: {} as JoinAdapter, flow, storage: {} as FlowStorage,
    userToken: async () => options.token ?? 'server-only-github-token',
    retainUserToken: async () => {}, forgetUserToken: () => {},
    hosted: async (request, identity, sessionId) => {
      calls.push({ body: await request.json(), identity, sessionId });

      return Response.json({ reviewerId: identity.id });
    },
  });

  return { http, calls };
}

function request(headers: Record<string, string> = {}) {
  return new Request('https://join.test/api/hosted/inspect', { method: 'POST',
    headers: {
      Origin: 'https://site.test', Authorization: 'Session held-server-session',
      'X-CSRF-Token': 'held-server-csrf', 'Content-Type': 'application/json',
      ...headers,
    }, body: '{}',
  });
}

test('Hosted session routes require exact origin, live session, CSRF and held user token',
  async () => {
    const cases = [
      { input: request({ Origin: 'https://attacker.test' }), status: 403 },
      { input: request({ Authorization: 'Session guessed' }), status: 401 },
      { input: request({ 'X-CSRF-Token': 'guessed' }), status: 403 },
      { input: request(), options: { expired: true }, status: 401 },
      { input: request(), options: { token: '' }, status: 401 },
    ];

    for (const scenario of cases) {
      const current = handler(scenario.options);
      const response = await current.http.handle(scenario.input);

      assert.equal(response.status, scenario.status);
      assert.deepEqual(current.calls, []);
    }
  });

test('Hosted handler receives only server-held identity and user authority after checks',
  async () => {
    const current = handler();
    const response = await current.http.handle(request());

    assert.equal(response.status, 200);

    assert.deepEqual(current.calls, [{ body: {}, sessionId: 'held-server-session',
      identity: { id: 100, login: 'reviewer', type: 'User',
        userToken: 'server-only-github-token' },
    }]);

    assert.deepEqual(await response.json(), { reviewerId: 100 });
  });
