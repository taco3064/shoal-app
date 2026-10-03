import assert from 'node:assert/strict';
import test from 'node:test';
import { loadJoinConfig } from './config';

const base = {
  GITHUB_APP_ID: '1',
  GITHUB_APP_SLUG: 'shoal-dev',
  GITHUB_APP_PRIVATE_KEY: 'private\\nkey',
  GITHUB_APP_CLIENT_ID: 'client',
  GITHUB_APP_CLIENT_SECRET: 'secret',
};

test('Join config allows only explicit localhost HTTP development origins', () => {
  const config = loadJoinConfig({
    ...base,
    JOIN_SERVICE_ORIGIN: 'http://127.0.0.1:8787',
    JOIN_WEBSITE_RETURN_URL: 'http://localhost:4321/join/',
  });

  assert.equal(config.serviceOrigin, 'http://127.0.0.1:8787');
  assert.equal(config.websiteOrigin, 'http://localhost:4321');
  assert.equal(config.returnUrl, 'http://localhost:4321/join/');
});

test('Join config rejects non-local HTTP origins', () => {
  assert.throws(
    () =>
      loadJoinConfig({
        ...base,
        JOIN_SERVICE_ORIGIN: 'http://join.example',
        JOIN_WEBSITE_RETURN_URL: 'http://localhost:4321/join/',
      }),
    /Production authentication requires HTTPS/,
  );

  assert.throws(
    () =>
      loadJoinConfig({
        ...base,
        JOIN_SERVICE_ORIGIN: 'http://127.0.0.1:8787',
        JOIN_WEBSITE_RETURN_URL: 'http://site.example/join/',
      }),
    /Production authentication requires HTTPS/,
  );
});
