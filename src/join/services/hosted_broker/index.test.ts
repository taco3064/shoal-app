import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { hostedCapabilities } from '~app/protocol/services/hosted_capability';
import { networkRoot } from '~app/protocol/services/network_compatibility';

import {
  exchangeHostedAuthority,
  type BrokerAuthority,
  type BrokerOptions,
  type BrokerRepository,
  type BrokerRequest,
  type BrokerRun,
} from './index';

const now = 1800000000000;

const endpoint = 'https://shoal.example/hosted/exchange';
const sha = 'a'.repeat(40);

const root: BrokerRepository = {
  id: String(networkRoot.repositoryId), fullName: 'root/station', ownerId: '8',
  ownerType: 'User', parentId: null, defaultBranch: 'main', private: false,
};

const repository: BrokerRepository = {
  id: '12', fullName: 'reviewer/station', ownerId: '9', ownerType: 'User',
  parentId: root.id, defaultBranch: 'main', private: false,
};

const requestBody: BrokerRequest = {
  formatVersion: 1, repositoryId: repository.id, reviewerId: repository.ownerId,
  workflowRef: `${repository.fullName}/.github/workflows/reviewer-summary.yml@refs/heads/main`,
  workflowSha: sha, runId: '23', runAttempt: '1',
};

const run: BrokerRun = {
  id: '23', repositoryId: '12', runAttempt: '1', headSha: sha, headBranch: 'main',
  event: 'schedule', status: 'in_progress',
  path: '.github/workflows/reviewer-summary.yml',
};

const claims = {
  iss: 'https://token.actions.githubusercontent.com', aud: endpoint,
  iat: now / 1000 - 10, nbf: now / 1000 - 10, exp: now / 1000 + 290,
  repository: repository.fullName, repository_id: '12', repository_owner_id: '9',
  repository_owner: 'reviewer', workflow_ref: requestBody.workflowRef,
  workflow_sha: sha, run_id: '23', run_attempt: '1',
  job_workflow_ref: `${repository.fullName}/.github/workflows/hosted-review.yml@refs/heads/main`,
  job_workflow_sha: sha, ref: 'refs/heads/main', ref_type: 'branch', sha,
  sub: `repo:${repository.fullName}:ref:refs/heads/main`, event_name: 'schedule',
};

const authority: BrokerAuthority = {
  reviewerToken: 'reviewer_personal_token_12345',
  lifecycleToken: 'station_lifecycle_token_12345',
  expiresAt: new Date(now + 3600000).toISOString(),
};

const pair = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
}, true, ['sign', 'verify']);

const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'key' };

async function assertion(change: Record<string, unknown> = {}): Promise<string> {
  const header = Buffer.from(JSON.stringify({
    alg: 'RS256', typ: 'JWT', kid: 'key',
  })).toString('base64url');

  const payload = Buffer.from(JSON.stringify({ ...claims, ...change }))
    .toString('base64url');

  const message = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(message),
  );

  return `${message}.${Buffer.from(signature).toString('base64url')}`;
}

function makeRequest(token: string, body: unknown = requestBody): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function options(
  change: Record<string, unknown> = {},
): Promise<BrokerOptions & { issued: () => number }> {
  let count = 0;

  return {
    request: makeRequest(await assertion(change)), endpoint, audience: endpoint,
    now: () => now, fetcher: async () => Response.json({ keys: [jwk] }),
    github: {
      getRepository: async (id) => id === root.id ? root : repository,
      getRun: async () => run,
      readWorkflow: async () => new Uint8Array([1]),
      readMode: async () => 'review',
    },
    issueAuthority: async (identity) => {
      assert.deepEqual(identity, {
        repositoryId: '12', reviewerId: '9', repositoryFullName: repository.fullName,
      });

      count += 1;

      return authority;
    },
    issued: () => count,
  };
}

async function refused(input: BrokerOptions & { issued: () => number }): Promise<void> {
  const response = await exchangeHostedAuthority(input);
  const body = await response.text();

  assert.notEqual(response.status, 200);
  assert.equal(input.issued(), 0);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(body, /Bearer|reviewer_personal_token|station_lifecycle_token|raw-secret/);
}

test('rejects endpoint, method, session and body substitution', async () => {
  for (const body of [
    { ...requestBody, formatVersion: 2 }, { ...requestBody, repositoryId: 12 },
    { ...requestBody, reviewerId: '0' }, { ...requestBody, runAttempt: '01' },
    { ...requestBody, workflowSha: 'latest' }, { ...requestBody, session: 'raw-secret' },
    ['array'], 'x'.repeat(4097),
  ]) {
    const input = await options();

    input.request = makeRequest(await assertion(), body);
    await refused(input);
  }

  for (const override of [
    { endpoint: endpoint.replace('https:', 'http:') }, { endpoint: `${endpoint}?x=1` },
    { request: new Request(endpoint) },
    { request: new Request(endpoint, { method: 'POST', body: '{}' }) },
  ]) {
    await refused({ ...await options(), ...override });
  }
});

test('rejects signed caller, reusable, run and owner substitution', async () => {
  const changes = [
    { repository: 'attacker/station' }, { repository_id: '44' },
    { repository_owner_id: '10' }, { repository_owner: 'attacker' },
    { workflow_ref: 'reviewer/station/.github/workflows/other.yml@refs/heads/main' },
    { workflow_sha: 'b'.repeat(40) }, { run_id: '24' }, { run_attempt: '2' },
    { job_workflow_ref: 'attacker/reusable/.github/workflows/hosted.yml@main' },
    { job_workflow_sha: 'b'.repeat(40) }, { ref: 'refs/heads/other' },
    { sub: 'repo:reviewer/station:pull_request' }, { event_name: 'pull_request' },
    { sha: 'b'.repeat(40) }, { ref_type: 'tag' },
  ];

  for (const change of changes) {
    await refused(await options(change));
  }
});

test('revalidates current Membership and exact execution', async () => {
  for (const change of [
    { id: '99' }, { ownerId: '10' }, { ownerType: 'Organization' },
    { private: true }, { parentId: '99' }, { defaultBranch: 'other' },
  ]) {
    const input = await options();

    input.github.getRepository = async (id) =>
      id === root.id ? root : { ...repository, ...change };

    await refused(input);
  }

  for (const change of [
    { id: '24' }, { runAttempt: '2' }, { status: 'completed' },
    { repositoryId: '13' }, { headSha: 'b'.repeat(40) }, { event: 'push' },
    { path: '.github/workflows/other.yml' }, { headBranch: 'other' },
  ]) {
    const input = await options();

    input.github.getRun = async () => ({ ...run, ...change });
    await refused(input);
  }

  const input = await options();

  input.github.getRepository = async () => {
    throw new Error('raw-secret GitHub request diagnostics');
  };

  await refused(input);
});

test('rejects unsupported bytes and disabled/invalid mode', async () => {
  for (const mode of [null, '', 'none', 'unknown', 'review']) {
    const input = await options();

    input.github.readMode = async () => mode;
    await refused(input);
  }
});

// These fixtures must be the final exact source bytes from the accepted train.
async function trustedOptions(): Promise<BrokerOptions & { issued: () => number }> {
  assert.equal(hostedCapabilities.length, 1, 'Final exact trust binding required.');

  const caller = await readFile(new URL('./caller.fixture.txt', import.meta.url));
  const auxiliary = await readFile(new URL('./auxiliary.fixture.txt', import.meta.url));
  const input = await options();

  input.github.readWorkflow = async (_name, path, ref) => {
    assert.equal(ref, sha);

    return path.endsWith('/reviewer-summary.yml') ? caller : auxiliary;
  };

  return input;
}

test('exact workflow exchange returns distinct bounded roles', async () => {
  const input = await trustedOptions();

  input.issueAuthority = async () => ({ ...authority, refreshToken: 'raw-secret' });

  const response = await exchangeHostedAuthority(input);

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    formatVersion: 1, repositoryId: '12', reviewerId: '9', ...authority,
  });
});

test('supports the current Personal Account Root owner', async () => {
  const input = await trustedOptions();
  const rootCaller = `${root.fullName}/.github/workflows/reviewer-summary.yml@refs/heads/main`;
  const rootAuxiliary = `${root.fullName}/.github/workflows/hosted-review.yml@refs/heads/main`;

  input.request = makeRequest(await assertion({
    repository: root.fullName, repository_id: root.id, repository_owner_id: root.ownerId,
    repository_owner: 'root', workflow_ref: rootCaller,
    job_workflow_ref: rootAuxiliary, sub: `repo:${root.fullName}:ref:refs/heads/main`,
  }), {
    ...requestBody, repositoryId: root.id, reviewerId: root.ownerId,
    workflowRef: rootCaller,
  });

  input.github.getRepository = async () => root;
  input.github.getRun = async () => ({ ...run, repositoryId: root.id });

  input.issueAuthority = async (identity) => {
    assert.equal(identity.reviewerId, root.ownerId);
    assert.equal(identity.repositoryId, root.id);

    return authority;
  };

  const response = await exchangeHostedAuthority(input);

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    formatVersion: 1, repositoryId: root.id, reviewerId: root.ownerId, ...authority,
  });
});

test('accepts exact immutable subject and rejects identity substitutions', async () => {
  for (const sub of [
    'repo:reviewer@9/station@12:ref:refs/heads/main',
    'repo:reviewer@10/station@12:ref:refs/heads/main',
    'repo:reviewer@9/station@13:ref:refs/heads/main',
    'repo:attacker@9/station@12:ref:refs/heads/main',
    'repo:reviewer@9/other@12:ref:refs/heads/main',
    'repo:reviewer@9/station@12:ref:refs/heads/other',
    'repo:reviewer@9/station@12:environment:production',
    'repo:reviewer@9/station@12:pull_request',
  ]) {
    const input = await trustedOptions();

    input.request = makeRequest(await assertion({ sub }));

    if (sub === 'repo:reviewer@9/station@12:ref:refs/heads/main') {
      assert.equal((await exchangeHostedAuthority(input)).status, 200);
      assert.equal(input.issued(), 1);
    } else {
      await refused(input);
    }
  }
});

test('disabled mode and expired assertion refuse trusted bytes', async () => {
  for (const mode of [null, '', 'none', 'unknown']) {
    const input = await trustedOptions();

    input.github.readMode = async () => mode;
    await refused(input);
  }

  const input = await trustedOptions();
  let elapsed = false;

  input.now = () => elapsed ? now + 300000 : now;

  input.github.getRun = async () => {
    elapsed = true;

    return run;
  };

  await refused(input);
});

test('rejects one-byte caller or auxiliary drift before issuing authority', async () => {
  for (const target of ['reviewer-summary.yml', 'hosted-review.yml']) {
    const input = await trustedOptions();
    const readWorkflow = input.github.readWorkflow;

    input.github.readWorkflow = async (name, path, ref) => {
      const bytes = await readWorkflow(name, path, ref);

      return path.endsWith(target) ? new Uint8Array([...(bytes ?? []), 10]) : bytes;
    };

    await refused(input);
  }
});

test('refuses an Action pin substitution in admitted auxiliary bytes', async () => {
  const input = await trustedOptions();
  const readWorkflow = input.github.readWorkflow;
  const binding = hostedCapabilities[0]!;

  input.github.readWorkflow = async (name, path, ref) => {
    const bytes = await readWorkflow(name, path, ref);

    if (!path.endsWith('hosted-review.yml')) {
      return bytes;
    }

    const content = new TextDecoder().decode(bytes!);

    assert.equal(content.split(`hosted-review@${binding.actionCommit}`).length, 3);

    return new TextEncoder().encode(content.replaceAll(
      `hosted-review@${binding.actionCommit}`, `hosted-review@${'0'.repeat(40)}`,
    ));
  };

  await refused(input);
});

test('refuses invalid or expired roles without leaking values', async () => {
  for (const change of [
    { reviewerToken: authority.lifecycleToken }, { lifecycleToken: '' },
    { reviewerToken: 'x'.repeat(513) },
    { expiresAt: new Date(now + 60000).toISOString() },
    { expiresAt: new Date(now + 8 * 3600000 + 1).toISOString() },
  ]) {
    const input = await trustedOptions();

    input.issueAuthority = async () => ({ ...authority, ...change });
    await refused(input);
  }

  const input = await trustedOptions();

  input.issueAuthority = async () => {
    throw new Error('raw-secret refresh material');
  };

  await refused(input);
});

test('diagnostics project fixed stages without reflecting issuer secrets', async () => {
  const input = await trustedOptions();
  const failures: unknown[] = [];

  input.issueAuthority = async () => {
    throw new Error('raw-secret token');
  };

  input.reportFailure = (failure) => {
    failures.push(failure);
  };

  await refused(input);
  assert.deepEqual(failures, [{ stage: 'authority', reason: 'UNEXPECTED', status: 0 }]);
  input.request = makeRequest(await assertion());

  input.reportFailure = () => {
    throw new Error('raw-secret logger');
  };

  await refused(input);
});
