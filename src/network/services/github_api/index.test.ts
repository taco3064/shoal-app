import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubApi } from './index';
import { summaryReleaseTag } from '~app/protocol/services/network_compatibility';

const fullName = 'alice/node';
const repositoryId = 42;
const runId = 55;

const payload = new TextEncoder().encode(
  '{"reviewerNode":{"repositoryId":42}}\n',
);

function release(attempt: number) {
  const tag = summaryReleaseTag(repositoryId, runId, attempt);
  const browser_download_url = `https://github.com/${fullName}/releases/download/${tag}/reviewer-summary.json`;

  return {
    id: attempt + 100,
    tag_name: tag,
    draft: false,
    author: { id: 41898282 },
    assets: [
      {
        id: attempt + 200,
        name: 'reviewer-summary.json',
        size: payload.length,
        state: 'uploaded',
        browser_download_url,
        uploader: { id: 41898282 },
      },
    ],
  };
}

test('public release transport binds exact repository, run, and attempt', async () => {
  const requests: string[] = [];

  const api = new GitHubApi('unused', async (input, options) => {
    const url = String(input);

    requests.push(url);

    assert.equal(
      (options?.headers as Record<string, string> | undefined)?.Authorization,
      undefined,
    );

    const attempt = url.includes('-55-2') ? 2 : 1;

    return url.startsWith('https://api.github.com')
      ? Response.json(release(attempt))
      : new Response(payload);
  });

  const first = await api.publicSummary(fullName, repositoryId, runId, 1);
  const second = await api.publicSummary(fullName, repositoryId, runId, 2);

  assert.notEqual(first?.url, second?.url);
  assert.deepEqual(first?.bytes, payload);
  assert.equal(second?.assetId, 202);
  assert.equal(requests.length, 4);
});

test('missing transport or forged locator rejects only that attempt', async () => {
  const missing = new GitHubApi(
    'unused',
    async () => new Response('', { status: 404 }),
  );

  assert.equal(
    await missing.publicSummary(fullName, repositoryId, runId, 1),
    null,
  );

  const mismatched = release(1);

  mismatched.assets[0].browser_download_url
    = 'https://example.net/untrusted.json';

  const api = new GitHubApi('unused', async () => Response.json(mismatched));

  assert.equal(await api.publicSummary(fullName, repositoryId, runId, 1), null);
});
