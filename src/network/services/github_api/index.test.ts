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

  const failed = new GitHubApi('unused', async () =>
    new Response('', { status: 503 }));

  assert.equal(await gone.publicSummary(fullName, repositoryId, runId, 1), null);
  assert.equal(await oversized.publicSummary(fullName, repositoryId, runId, 1), null);

  await assert.rejects(
    failed.publicSummary(fullName, repositoryId, runId, 1),
    (error: unknown) => error instanceof GitHubHttpError && error.status === 503,
  );
});
