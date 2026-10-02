import { createSign } from 'node:crypto';

import type { AppConfig } from './types';

export function appJwt(config: AppConfig, now = Date.now()): string {
  const issued = Math.floor(now / 1000) - 60;

  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  ).toString('base64url');

  const payload = Buffer.from(
    JSON.stringify({ iat: issued, exp: issued + 600, iss: config.appId }),
  ).toString('base64url');

  const input = `${header}.${payload}`;

  const signature = Buffer.from(createSign('RSA-SHA256')
    .update(input)
    .end()
    .sign(config.privateKey))
    .toString('base64url');

  return `${input}.${signature}`;
}
