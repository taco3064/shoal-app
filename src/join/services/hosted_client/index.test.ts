import assert from 'node:assert/strict';
import test from 'node:test';
import { hostedClient } from './index';

const session = {
  session: 'website-session', csrfToken: 'csrf', identity: { id: 1, login: 'owner' },
};

test('Hosted requests bind mode confirmation and repository with CSRF', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; options: RequestInit }[] = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options: options! });

    return Response.json({});
  };

  try {
    const client = hostedClient('https://join.example');

    await client.mode(session, { repositoryId: 42, mode: 'all', confirmed: true });
    await client.disconnect(session, 42);
    assert.equal(calls[0].url, 'https://join.example/api/hosted/mode');

    assert.deepEqual(JSON.parse(calls[0].options.body as string), {
      repositoryId: 42, mode: 'all', confirmed: true,
    });

    assert.deepEqual(calls[0].options.headers, {
      'Content-Type': 'application/json',
      Authorization: 'Session website-session',
      'X-CSRF-Token': 'csrf',
    });

    assert.equal(calls[0].options.credentials, 'include');

    assert.deepEqual(JSON.parse(calls[1].options.body as string), {
      repositoryId: 42,
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('Reviewer connection accepts only a bound service start URL', async () => {
  const original = globalThis.fetch;

  try {
    const bound = `42.1.${'n'.repeat(43)}`;
    const valid = new URL('/hosted/auth/start', 'https://join.example');

    valid.searchParams.set('state', bound);
    valid.searchParams.set('ticket', 't'.repeat(43));

    const candidates = [
      'https://attacker.example/steal',
      'https://github.com/login/oauth/authorize',
      valid.href.replace('/hosted/auth/start', '/api/logout'),
      valid.href.replace('42.1.', '41.1.'),
      valid.href.replace('42.1.', '42.2.'),
      `${valid.href}&state=${bound}`,
      `${valid.href}&extra=unsafe`,
      `${valid.href}#unexpected`,
      valid.href.replace('https://', 'https://user:password@'),
      valid.href.replace('ticket=', 'ticket=short'),
    ];

    for (const authorizationUrl of candidates) {
      globalThis.fetch = async () => Response.json({ authorizationUrl });

      await assert.rejects(
        hostedClient('https://join.example').connect(session, 42),
        /unexpected authorization destination/,
      );
    }

    globalThis.fetch = async () => Response.json({ authorizationUrl: valid.href });

    assert.equal(
      await hostedClient('https://join.example').connect(session, 42), valid.href,
    );
  } finally {
    globalThis.fetch = original;
  }
});
