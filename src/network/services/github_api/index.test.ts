import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubApi, GitHubHttpError } from './index';
import { summaryTransportTag } from '~app/protocol/services/network_compatibility';

const fullName = 'alice/node';
const repositoryId = 42;
const runId = 55;

const payload = new TextEncoder().encode(
  '{"reviewerNode":{"repositoryId":42}}\n',
);

function transportUrl(attempt: number): string {
  const tag = summaryTransportTag(repositoryId, runId, attempt);

  return `https://raw.githubusercontent.com/${fullName}/${tag}/reviewer-summary.json`;
}

test('public Git transport reads exact attempt bytes anonymously', async () => {
  const requests: string[] = [];

  const api = new GitHubApi('unused', async (input, options) => {
    requests.push(String(input));

    assert.equal(
      (options?.headers as Record<string, string> | undefined)?.Authorization,
      undefined,
    );

    return new Response(payload);
  });

  const first = await api.publicSummary(fullName, repositoryId, runId, 1);
  const second = await api.publicSummary(fullName, repositoryId, runId, 2);

  assert.deepEqual(requests, [transportUrl(1), transportUrl(2)]);
  assert.equal(first?.url, transportUrl(1));
  assert.equal(second?.url, transportUrl(2));
  assert.deepEqual(first?.bytes, payload);
});

test('missing attempt transport rejects only that attempt', async () => {
  const api = new GitHubApi('unused', async (input) =>
    new Response(
      String(input) === transportUrl(1) ? '' : payload,
      { status: String(input) === transportUrl(1) ? 404 : 200 },
    ));

  assert.equal(await api.publicSummary(fullName, repositoryId, runId, 1), null);

  assert.deepEqual(
    (await api.publicSummary(fullName, repositoryId, runId, 2))?.bytes,
    payload,
  );
});

test('gone or oversized transport rejects; upstream failure stops scan', async () => {
  const gone = new GitHubApi('unused', async () =>
    new Response('', { status: 410 }));

  const oversized = new GitHubApi('unused', async () =>
    new Response(new Uint8Array(1024 * 1024 + 1)));

  const failed = new GitHubApi(
    'unused',
    async () => new Response('', { status: 503 }),
    { retryBudgetMs: 0 },
  );

  assert.equal(await gone.publicSummary(fullName, repositoryId, runId, 1), null);
  assert.equal(await oversized.publicSummary(fullName, repositoryId, runId, 1), null);

  await assert.rejects(
    failed.publicSummary(fullName, repositoryId, runId, 1),
    (error: unknown) => error instanceof GitHubHttpError && error.status === 503,
  );
});

test('paginated reads follow GitHub Link headers to terminal page', async () => {
  const requests: string[] = [];

  const api = new GitHubApi('token', async (input) => {
    requests.push(String(input));

    if (String(input).endsWith('page=1')) {
      return new Response(
        JSON.stringify([{ id: 1 }]),
        {
          headers: {
            link: '<https://api.github.com/repos/alice/node/forks?per_page=100&page=2>; rel="next"',
          },
        },
      );
    }

    return new Response(JSON.stringify([{ id: 2 }]));
  });

  assert.deepEqual(await api.pages<{ id: number }>('/repos/alice/node/forks'), [
    { id: 1 },
    { id: 2 },
  ]);

  assert.deepEqual(requests, [
    'https://api.github.com/repos/alice/node/forks?per_page=100&page=1',
    'https://api.github.com/repos/alice/node/forks?per_page=100&page=2',
  ]);
});

test('malformed pagination and later-page failures fail the read', async () => {
  const malformed = new GitHubApi('token', async () =>
    new Response(JSON.stringify([]), { headers: { link: 'not-a-link' } }));

  await assert.rejects(
    malformed.pages('/repos/alice/node/forks'),
    /Malformed GitHub pagination Link header/,
  );

  const laterFailure = new GitHubApi(
    'token',
    async (input) =>
      String(input).endsWith('page=1')
        ? new Response(
            JSON.stringify([{ id: 1 }]),
            {
              headers: {
                link: '<https://api.github.com/repos/alice/node/forks?per_page=100&page=2>; rel="next"',
              },
            },
          )
        : new Response('', { status: 503 }),
    { retryBudgetMs: 0 },
  );

  await assert.rejects(
    laterFailure.pages('/repos/alice/node/forks'),
    (error: unknown) =>
      error instanceof GitHubHttpError && error.status === 503,
  );
});

test('retryable GitHub failures honor the bounded retry budget', async () => {
  const delays: number[] = [];
  let attempts = 0;

  const api = new GitHubApi(
    'token',
    async () => {
      attempts += 1;

      return attempts === 1
        ? new Response('', {
            status: 503,
            headers: { 'retry-after': '1' },
          })
        : new Response(JSON.stringify({ ok: true }));
    },
    {
      retryBudgetMs: 1000,
      sleep: async (ms) => {
        delays.push(ms);
      },
      now: () => 0,
    },
  );

  assert.deepEqual(await api.json('/repos/alice/node'), { ok: true });
  assert.deepEqual(delays, [1000]);
  assert.equal(attempts, 2);

  const exhausted = new GitHubApi(
    'token',
    async () =>
      new Response('', { status: 429, headers: { 'retry-after': '2' } }),
    {
      retryBudgetMs: 1000,
      sleep: async () => {},
      now: () => 0,
    },
  );

  await assert.rejects(
    exhausted.json('/repos/alice/node'),
    (error: unknown) =>
      error instanceof GitHubHttpError && error.status === 429,
  );
});
