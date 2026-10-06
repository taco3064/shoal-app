import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { Miniflare, Response as WorkerResponse } from 'miniflare';

import { verifyGitHubOidc } from './oidc';

const now = 1800000000000;
const audience = 'https://shoal.example/hosted/exchange';

const pair = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
}, true, ['sign', 'verify']);

const publicJwk = {
  ...await crypto.subtle.exportKey('jwk', pair.publicKey),
  kid: 'github-test-key', alg: 'RS256', use: 'sig',
};

const validClaims = {
  iss: 'https://token.actions.githubusercontent.com', aud: audience,
  iat: now / 1000 - 10, nbf: now / 1000 - 10, exp: now / 1000 + 290,
  repository_id: '12',
};

function encoded(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function signed(
  claims: unknown,
  header: unknown = { alg: 'RS256', typ: 'JWT', kid: publicJwk.kid },
): Promise<string> {
  const message = `${encoded(header)}.${encoded(claims)}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(message),
  );

  return `${message}.${Buffer.from(signature).toString('base64url')}`;
}

const fetcher: typeof fetch = async (url) => {
  assert.equal(url, 'https://token.actions.githubusercontent.com/.well-known/jwks');

  return Response.json({ keys: [publicJwk] });
};

test('verifies signed OIDC through native Workers fetch', async () => {
  const token = await signed(validClaims);
  let requests = 0;
  let redirect = false;

  const code = buildSync({ stdin: { resolveDir: process.cwd(), contents: `
    import { verifyGitHubOidc } from './src/join/services/hosted_broker/oidc.ts';
    export default {async fetch(request) {
      try {
        const claims = await verifyGitHubOidc({token:await request.text(),
          audience:${JSON.stringify(audience)},now:${now},fetcher:fetch});
        return Response.json(claims);
      } catch (error) {
        return Response.json({error:error.message},{status:500});
      }
    }};
  ` }, bundle: true, write: false, format: 'esm', platform: 'node',
  target: 'es2022' }).outputFiles[0].text;

  const runtime = new Miniflare({ workers: [{ config: {
    name: 'oidc-native-fetch', compatibilityDate: '2026-10-05',
    manifest: { mainModule: 'worker.mjs', modules: {
      'worker.mjs': { type: 'esm', contents: code },
    } },
  }, dev: { outboundService: { type: 'fetcher', handler: async (request) => {
    assert.equal(request.url, 'https://token.actions.githubusercontent.com/.well-known/jwks');
    requests++;

    if (redirect) {
      return new WorkerResponse(null, { status: 302,
        headers: { Location: 'https://unexpected.test/jwks' } });
    }

    return WorkerResponse.json({ keys: [publicJwk] });
  } } } }] });

  try {
    const response = await runtime.dispatchFetch('https://test.local/', {
      method: 'POST', body: token,
    });

    const result = await response.json();

    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual(result, validClaims);
    assert.equal(requests, 1);
    redirect = true;

    const refused = await runtime.dispatchFetch('https://test.local/', {
      method: 'POST', body: token,
    });

    assert.equal(refused.status, 500);
    assert.deepEqual(await refused.json(), { error: 'OIDC_REFUSED' });
    assert.equal(requests, 2);
  } finally {
    await runtime.dispose();
  }
});

test('verifies RSA signature, fixed issuer and exact audience', async () => {
  const token = await signed(validClaims);
  const result = await verifyGitHubOidc({ token, audience, now, fetcher });

  assert.deepEqual(result, validClaims);
});

test('rejects forged assertion payload even with a matching key id', async () => {
  const token = await signed(validClaims);
  const parts = token.split('.');

  parts[1] = encoded({ ...validClaims, repository_id: '99' });

  await assert.rejects(verifyGitHubOidc({
    token: parts.join('.'), audience, now, fetcher,
  }));
});

test('rejects wrong issuer/audience and unbounded times', async () => {
  const cases = [
    { iss: 'https://attacker.example' },
    { aud: 'other' }, { aud: [audience] }, { exp: now / 1000 },
    { nbf: now / 1000 + 31 }, { iat: now / 1000 + 31 },
    { iat: now / 1000 - 301 }, { exp: now / 1000 + 1000 },
    { exp: '1800000300' }, { nbf: null }, { iat: undefined },
  ];

  for (const change of cases) {
    await assert.rejects(verifyGitHubOidc({
      token: await signed({ ...validClaims, ...change }), audience, now, fetcher,
    }));
  }
});

test('rejects unsupported algorithms and token-directed keys', async () => {
  for (const change of [
    { alg: 'none' }, { alg: 'HS256' }, { kid: 'unknown' },
    { jku: 'https://attacker.example/jwks' }, { x5u: 'https://attacker.example' },
    { crit: ['unknown'] },
  ]) {
    const token = await signed(validClaims, {
      alg: 'RS256', typ: 'JWT', kid: publicJwk.kid, ...change,
    });

    await assert.rejects(verifyGitHubOidc({ token, audience, now, fetcher }));
  }
});

test('rejects ambiguous/ineligible JWKS and key-service failures', async () => {
  const values = [
    { keys: [publicJwk, publicJwk] }, { keys: [] },
    { keys: [{ ...publicJwk, alg: 'HS256' }] },
    { keys: [{ ...publicJwk, use: 'enc' }] },
    { keys: [{ ...publicJwk, key_ops: ['encrypt'] }] },
  ];

  const token = await signed(validClaims);

  for (const jwks of values) {
    await assert.rejects(verifyGitHubOidc({
      token, audience, now, fetcher: async () => Response.json(jwks),
    }));
  }

  await assert.rejects(verifyGitHubOidc({
    token, audience, now, fetcher: async () => new Response('', { status: 503 }),
  }));
});
