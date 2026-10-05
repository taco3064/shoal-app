import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { networkRoot } from '~app/protocol/services/network_compatibility';

import { GitHubJoinClient, GitHubError, type Repository } from '../github_join';
import { HostedSettingsService } from './index';

const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

const config = {
  appId: '1', privateKey: key, installationUrl: 'https://github.com/apps/shoal',
  brokerUrl: 'https://join.shoal.example/hosted/broker',
  brokerAudience: 'https://join.shoal.example/hosted', authorizationAvailable: true,
};

const fixtureFile = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function fixture(rootOwner = false) {
  const identity = { id: rootOwner ? 1 : 2, login: rootOwner ? 'root' : 'alice',
    type: 'User' };

  const root: Repository = {
    id: networkRoot.repositoryId, full_name: networkRoot.fullName,
    default_branch: 'main', owner: { id: 1, login: 'root', type: 'User' },
    private: false, fork: false, has_issues: true,
  };

  const node: Repository = rootOwner
    ? root
    : {
        ...root, id: 17, full_name: 'alice/station', fork: true,
        parent: { id: root.id }, owner: identity,
      };

  const contents = new Map([
    ['.github/ISSUE_TEMPLATE/review-request.yml', fixtureFile('review-request.yml')],
    ['.github/workflows/reviewer-summary.yml', fixtureFile('reviewer-summary.yml')],
    ['.github/workflows/hosted-review.yml', fixtureFile('hosted-review.yml')],
  ]);

  const variables = new Map<string, string>();
  const writes: string[] = [];
  let permission = true;
  let disconnected = false;
  let rebound = false;
  let deleted = false;
  let changeAfterWrite = false;
  const client = new GitHubJoinClient(config);

  client.identity = async () => identity;

  client.repository = async (_token, locator) => locator === networkRoot.fullName
    ? root
    : node;

  client.repositoryById = async () => {
    if (deleted) {
      throw new GitHubError(404, { pathClass: 'repository_metadata' });
    }

    return rebound ? { ...node, id: 42 } : node;
  };

  client.ownerRepositories = async function* () {
    yield [node];
  };

  client.rootForks = async function* () {
    yield [node];
  };

  client.head = async () => 'f'.repeat(40);

  client.file = async (_token, _repository, path) => {
    const content = contents.get(path);

    return content === undefined ? null : { sha: 'c'.repeat(40), content };
  };

  client.binding = async () => {
    throw new Error('Base binding must not be used.');
  };

  const fetcher: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;

    if (path.endsWith('/installation')) {
      return Response.json({
        id: 9, account: identity,
        permissions: permission ? { actions_variables: 'write' } : {},
      });
    }

    if (path.endsWith('/access_tokens')) {
      return Response.json({ token: 'variables-token' });
    }

    if (method === 'POST' || method === 'PATCH') {
      writes.push(body.name);
      variables.set(body.name, body.value);

      if (changeAfterWrite) {
        rebound = true;
      }

      return new Response(null, { status: 204 });
    }

    const name = path.split('/').at(-1) ?? '';

    return variables.has(name)
      ? Response.json({ name, value: variables.get(name) })
      : new Response(null, { status: 404 });
  };

  const service = new HostedSettingsService({
    client, config, fetcher,
    grantState: async () => disconnected ? 'disconnected' : 'connected',
  });

  return {
    service, identity, node, contents, variables, writes,
    removePermission: () => { permission = false; },
    disconnect: () => { disconnected = true; },
    replaceNode: () => { rebound = true; },
    deleteNode: () => { deleted = true; },
    rebindAfterWrite: () => { changeAfterWrite = true; },
  };
}

test('Root and direct fork inspect authoritative public base trust independently',
  async () => {
    for (const rootOwner of [true, false]) {
      const current = fixture(rootOwner);

      current.removePermission();

      const settings = await current.service.inspect(current.identity);

      assert.equal(settings.repository?.id, current.node.id);
      assert.equal(settings.rootOwner, rootOwner);
      assert.equal(settings.membership, true);
      assert.equal(settings.baseReady, true);
      assert.equal(settings.callerSupported, true);
      assert.equal(settings.variablesAuthority, false);
      assert.equal(settings.mode.value, null);
      assert.equal(settings.copilot, 'unverified');
      assert.deepEqual(current.writes, []);
    }
  });

test('unset and empty are none; unknown non-empty remains invalid without writes',
  async () => {
    const current = fixture();

    for (const raw of [null, '', 'none', 'unexpected', ' review ']) {
      if (raw === null) {
        current.variables.delete('SHOAL_AUTOMATED_REVIEW');
      } else {
        current.variables.set('SHOAL_AUTOMATED_REVIEW', raw);
      }

      const settings = await current.service.inspect(current.identity);
      const valid = raw === null || raw === '' || raw === 'none';

      assert.equal(settings.mode.valid, valid);
      assert.equal(settings.mode.value, valid ? 'none' : null);
      assert.equal(settings.bootstrap, 'repair_required');
      assert.deepEqual(current.writes, []);
    }
  });

test('none stays configurable with unsupported trust and disconnected personal grant',
  async () => {
    const current = fixture();

    current.disconnect();
    current.contents.set('.github/workflows/reviewer-summary.yml', 'unsupported');
    current.contents.delete('.github/workflows/hosted-review.yml');
    current.variables.set('SHOAL_AUTOMATED_REVIEW', 'invalid');

    const settings = await current.service.configure(
      current.identity, current.node.id, 'none', false,
    );

    assert.equal(settings.mode.value, 'none');
    assert.equal(settings.baseReady, false);
    assert.equal(settings.grant, 'disconnected');
    assert.deepEqual(current.writes, ['SHOAL_AUTOMATED_REVIEW']);
  });

test('unknown auxiliary cannot enable Hosted execution, stale IDs refuse every mode',
  async () => {
    const current = fixture();

    current.contents.set('.github/workflows/hosted-review.yml', 'unknown');

    await assert.rejects(current.service.configure(
      current.identity, current.node.id, 'review', true,
    ), /capability/);

    await assert.rejects(current.service.configure(
      current.identity, 999, 'none', false,
    ), /STALE_PLAN/);

    await assert.rejects(current.service.configure(
      current.identity, current.node.id, 'review', false,
    ), /Explicit/);

    assert.deepEqual(current.writes, []);
    current.replaceNode();

    await assert.rejects(current.service.configure(
      current.identity, current.node.id, 'none', false,
    ), /identity mismatch|STALE_PLAN/);

    assert.deepEqual(current.writes, []);
  });

test('rebound read-back refuses success after a mode mutation', async () => {
  const current = fixture();

  current.rebindAfterWrite();

  await assert.rejects(current.service.configure(
    current.identity, current.node.id, 'none', false,
  ), /identity mismatch|STALE_PLAN/);

  assert.deepEqual(current.writes, ['SHOAL_AUTOMATED_REVIEW']);
});

test('deleted Reviewer Node refuses mode mutation and performs no writes', async () => {
  const current = fixture();

  current.deleteNode();

  await assert.rejects(current.service.configure(
    current.identity, current.node.id, 'none', false,
  ), /STALE_PLAN/);

  assert.deepEqual(current.writes, []);
});

test('missing auxiliary preserves base station readiness', async () => {
  const current = fixture();

  current.contents.delete('.github/workflows/hosted-review.yml');

  const settings = await current.service.inspect(current.identity);

  assert.equal(settings.baseReady, true);
  assert.equal(settings.auxiliarySupported, false);
  assert.deepEqual(current.writes, []);
});
