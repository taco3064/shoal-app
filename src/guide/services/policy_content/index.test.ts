import assert from 'node:assert/strict';
import test from 'node:test';
import { policyContent } from './index';

const repository = 'reviewer/station';
const commit = 'a'.repeat(40);
const url = `https://github.com/${repository}/blob/${commit}/README.md`;

test('reads pinned README instead of a mutable branch', async () => {
  const markdown = await policyContent(repository, url, async (requested) => {
    assert.equal(
      requested,
      `https://raw.githubusercontent.com/${repository}/${commit}/README.md`,
    );

    return new Response('# My Review Policy');
  });

  assert.equal(markdown, '# My Review Policy');
});

test('missing README is distinct from a failed fetch', async () => {
  const missing = await policyContent(repository, url, async () =>
    new Response('', { status: 404 }));

  assert.equal(missing, null);

  await assert.rejects(
    policyContent(repository, url, async () => new Response('', { status: 503 })),
    /fetch failed: 503/,
  );
});

test('rejects a policy URL for a different repository before fetching', async () => {
  await assert.rejects(
    policyContent(repository, `https://github.com/other/station/blob/${commit}/README.md`, async () => {
      throw new Error('Unexpected fetch');
    }),
    /Invalid pinned Review Policy URL/,
  );
});
