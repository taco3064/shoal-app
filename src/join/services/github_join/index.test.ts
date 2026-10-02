import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { appJwt } from './auth';
import { createGitHubJoinClient, GitHubError } from './index';

function config() {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });

  return {
    appId: '77',
    privateKey: key.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    clientId: 'app-client',
    clientSecret: 'confidential-client-secret',
    publicKey: key.publicKey,
  };
}

test('App JWT uses RS256 signature and bounded expiry with clock skew', () => {
  const settings = config();
  const now = 1_800_000_000_000;
  const jwt = appJwt(settings, now);
  const [header, payload, signature] = jwt.split('.');

  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), {
    alg: 'RS256',
    typ: 'JWT',
  });

  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), {
    iat: now / 1000 - 60,
    exp: now / 1000 + 540,
    iss: '77',
  });

  assert.equal(
    createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .end()
      .verify(settings.publicKey, Buffer.from(signature, 'base64url')),
    true,
  );
});

test('errors exclude remote body and bearer credentials', async () => {
  const settings = config();

  const fetcher: typeof fetch = async () =>
    new Response('sensitive server token response', { status: 403 });

  const client = createGitHubJoinClient(settings, fetcher);

  await assert.rejects(
    client.identity('server-user-token'),
    (error: unknown) => {
      assert.ok(error instanceof GitHubError);
      assert.equal(error.status, 403);
      assert.equal(error.message, 'GitHub request failed (403).');

      return true;
    },
  );
});

test('unknown operation refuses before token minting', async () => {
  let calls = 0;

  const fetcher: typeof fetch = async () => {
    calls += 1;

    return new Response('{}');
  };

  const client = createGitHubJoinClient(config(), fetcher);

  await assert.rejects(
    client.commitFiles(
      { repository: { id: 1 } as never, installationId: 77 },
      'head',
      [{ path: 'README.md', content: 'replacement' }],
      'unknown' as 'policy',
      async () => undefined,
    ),
    /Unknown privileged/,
  );

  assert.equal(calls, 0);
});

test('network failures keep secret-bearing error details server-private', async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    assert.ok(init?.signal);

    throw new Error('sensitive token in underlying transport');
  };

  const client = createGitHubJoinClient(config(), fetcher);

  await assert.rejects(client.identity('server-token'), {
    message: 'GitHub request unavailable or timed out.',
  });
});
