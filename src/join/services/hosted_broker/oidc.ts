import { boundedJson } from './bounded_json';

const issuer = 'https://token.actions.githubusercontent.com';
const jwksUrl = `${issuer}/.well-known/jwks`;

export type OidcClaims = Record<string, unknown>;

type SigningKey = JsonWebKey & { kid?: string };

function decodeSegment(segment: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error('OIDC_REFUSED');
  }

  const value = atob(segment.replaceAll('-', '+').replaceAll('_', '/'));

  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function decodeObject(segment: string): Record<string, unknown> {
  const object: unknown = JSON.parse(new TextDecoder().decode(decodeSegment(segment)));

  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new Error('OIDC_REFUSED');
  }

  return object as Record<string, unknown>;
}

function validateTimes(claims: OidcClaims, now: number): void {
  const { exp, nbf, iat } = claims;
  const seconds = Math.floor(now / 1000);

  if (typeof exp !== 'number' || !Number.isSafeInteger(exp)
    || typeof nbf !== 'number' || !Number.isSafeInteger(nbf)
    || typeof iat !== 'number' || !Number.isSafeInteger(iat)
    || exp <= seconds || nbf > seconds + 30 || iat > seconds + 30
    || iat < seconds - 300 || exp > iat + 600 || nbf > exp || iat >= exp) {
    throw new Error('OIDC_REFUSED');
  }
}

// The fixed issuer/JWKS endpoint is never taken from JWT headers (jku/x5u).
// No unsigned payload is used as repository authority before signature checking.
export async function verifyGitHubOidc(input: {
  token: string;
  audience: string;
  now: number;
  fetcher: typeof fetch;
}): Promise<OidcClaims> {
  if (input.token.length > 16384 || !input.audience || input.audience.length > 512) {
    throw new Error('OIDC_REFUSED');
  }

  const segments = input.token.split('.');

  if (segments.length !== 3) {
    throw new Error('OIDC_REFUSED');
  }

  const [headerPart, claimsPart, signaturePart] = segments as [string, string, string];
  const header = decodeObject(headerPart);
  const claims = decodeObject(claimsPart);

  if (header.alg !== 'RS256' || header.typ !== 'JWT'
    || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256
    || header.crit !== undefined || header.jku !== undefined || header.x5u !== undefined
    || claims.iss !== issuer || claims.aud !== input.audience) {
    throw new Error('OIDC_REFUSED');
  }

  validateTimes(claims, input.now);

  const response = await input.fetcher(jwksUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error('OIDC_REFUSED');
  }

  const jwks = await boundedJson(response.body, 65536) as { keys?: SigningKey[] };

  if (!Array.isArray(jwks.keys) || jwks.keys.length > 32) {
    throw new Error('OIDC_REFUSED');
  }

  const keys = jwks.keys.filter((key) => key.kid === header.kid);
  const key = keys[0];

  if (keys.length !== 1 || !key || key.kty !== 'RSA'
    || (key.alg !== undefined && key.alg !== 'RS256')
    || (key.use !== undefined && key.use !== 'sig')
    || (key.key_ops !== undefined && !key.key_ops.includes('verify'))) {
    throw new Error('OIDC_REFUSED');
  }

  const publicKey = await crypto.subtle.importKey('jwk', key, {
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256',
  }, false, ['verify']);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', publicKey,
    decodeSegment(signaturePart) as Uint8Array<ArrayBuffer>,
    new TextEncoder().encode(`${headerPart}.${claimsPart}`),
  );

  if (!valid) {
    throw new Error('OIDC_REFUSED');
  }

  return claims;
}
