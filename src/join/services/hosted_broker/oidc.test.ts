import assert from 'node:assert/strict';
import { test } from 'node:test';

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
