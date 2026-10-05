import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import type { Repository } from '../github_join';
import { HostedGitHub, type HostedVariableName } from './index';

const config = {
  appId: '1',
  privateKey: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
};

const repository: Repository = {
  id: 17, full_name: 'alice/station', default_branch: 'main',
  private: false, fork: true, has_issues: true,
  owner: { id: 9, login: 'alice', type: 'User' }, parent: { id: 1 },
};

function fixture(permission: string | null = 'write') {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const values = new Map<string, string>();
  let owner = 9;
  let suspended: string | null = null;
  let mismatch = false;

  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;

    calls.push({ path, method, body });

    if (path.endsWith('/installation')) {
      return Response.json({
        id: 3, account: { id: owner, type: 'User' }, suspended_at: suspended,
        permissions: permission ? { actions_variables: permission } : {},
      });
    }

    if (path.endsWith('/access_tokens')) {
      return Response.json({ token: 'scoped-variable-token' });
    }

    const name = path.split('/').at(-1) ?? '';

    if (method === 'POST' || method === 'PATCH') {
      values.set(body.name, body.value);

      return new Response(null, { status: method === 'POST' ? 201 : 204 });
    }

    if (values.has(name)) {
      return Response.json({ name, value: mismatch ? 'drift' : values.get(name) });
    }

    return new Response(null, { status: 404 });
  };

  return {
    github: new HostedGitHub(config, fetcher), calls, values,
    changeOwner: () => { owner = 42; },
    suspend: () => { suspended = '2026-01-01'; },
    mismatch: () => { mismatch = true; },
  };
}

test('inspection mints exact read scope and absent variables remain unwritten',
  async () => {
    const { github, calls } = fixture();
    const binding = await github.binding(repository);

    assert.ok(binding);

    assert.deepEqual(await github.variables(binding), {
      SHOAL_AUTOMATED_REVIEW: null,
      SHOAL_HOSTED_BROKER_URL: null,
      SHOAL_HOSTED_BROKER_AUDIENCE: null,
    });

    assert.deepEqual(calls.find((call) => call.path.endsWith('/access_tokens'))?.body, {
      repository_ids: [17], permissions: { metadata: 'read', actions_variables: 'read' },
    });

    assert.equal(calls.filter((call) => call.method !== 'GET'
      && !call.path.endsWith('/access_tokens')).length, 0);
  });

test('optional Variables binding ignores unrelated base App permissions', async () => {
  const available = fixture();

  assert.equal((await available.github.binding(repository))?.writable, true);

  const missing = fixture(null);

  assert.equal(await missing.github.binding(repository), null);
  assert.equal(missing.calls.length, 1);

  const rebound = fixture();

  rebound.changeOwner();
  assert.equal(await rebound.github.binding(repository), null);

  const suspended = fixture();

  suspended.suspend();
  assert.equal(await suspended.github.binding(repository), null);
});

test('bounded variable writes use POST/PATCH, scope write token and authoritative guards',
  async () => {
    const { github, calls } = fixture();
    const binding = await github.binding(repository);
    let guarded = 0;

    assert.ok(binding);

    const verify = async () => {
      guarded += 1;
    };

    await github.write(binding, 'SHOAL_AUTOMATED_REVIEW', 'none', verify);
    await github.write(binding, 'SHOAL_AUTOMATED_REVIEW', 'review', verify);
    await github.write(binding, 'SHOAL_AUTOMATED_REVIEW', 'review', verify);
    assert.equal(guarded, 6);

    assert.deepEqual(calls.filter((call) => call.path.endsWith('/access_tokens'))
      .map((call) => call.body), Array.from({ length: 3 }, () => ({
      repository_ids: [17], permissions: { metadata: 'read', actions_variables: 'write' },
    })));

    assert.deepEqual(calls.filter((call) => ['POST', 'PATCH'].includes(call.method)
      && !call.path.endsWith('/access_tokens')).map((call) => call.method),
    ['POST', 'PATCH']);

    assert.equal(calls.some((call) => call.path.includes('/git/')), false);
  });

test('stale guard refuses writes; unrelated variable names are rejected', async () => {
  const { github, calls } = fixture();
  const binding = await github.binding(repository);

  assert.ok(binding);

  await assert.rejects(github.write(
    binding, 'SHOAL_AUTOMATED_REVIEW', 'all', async () => {
      throw new Error('STALE_PLAN');
    }), /STALE_PLAN/);

  await assert.rejects(github.write(binding,
    'UNRELATED' as HostedVariableName, 'x', async () => {}), /outside/);

  assert.equal(calls.some((call) => call.method === 'PATCH'
    || call.path.endsWith('/actions/variables')), false);
});

test('read-back mismatch refuses success and read-only install cannot write',
  async () => {
    const changing = fixture();
    const binding = await changing.github.binding(repository);

    assert.ok(binding);
    changing.mismatch();

    await assert.rejects(changing.github.write(binding,
      'SHOAL_AUTOMATED_REVIEW', 'all', async () => {}), /read-back mismatch/);

    const readonly = fixture('read');
    const readBinding = await readonly.github.binding(repository);

    assert.ok(readBinding);
    assert.equal(readBinding.writable, false);

    await assert.rejects(readonly.github.write(readBinding,
      'SHOAL_AUTOMATED_REVIEW', 'all', async () => {}), /write authority/);
  });
