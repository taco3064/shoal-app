import assert from 'node:assert/strict';
import test from 'node:test';
import { GitHubClient, GitHubReadError } from './index';

const author = { id: 10, login: 'requester', type: 'User' };
const rootId = 100;

function repository(overrides = {}) {
  return {
    default_branch: 'main',
    fork: false,
    full_name: 'requester/station',
    id: rootId,
    name: 'station',
    owner: author,
    ...overrides,
  };
}

function clientFor(candidate: ReturnType<typeof repository>) {
  return new GitHubClient({
    fetch: async (url) => new Response(JSON.stringify(
      url.includes('/users/') ? [] : candidate,
    )),
  });
}

test('Root owner resolves by stable ID without fabricated fork or parent', async () => {
  const client = clientFor(repository());
  const node = await client.resolveRequesterNode(author, rootId, 'station');

  assert.deepEqual(node, {
    id: rootId,
    isFork: false,
    owner: author,
    parentRepositoryId: null,
  });
});

test('direct fork continues resolving with exact parent ID', async () => {
  const client = clientFor(repository({
    fork: true,
    id: 200,
    parent: { id: rootId },
  }));

  assert.deepEqual(await client.resolveRequesterNode(author, rootId, 'station'), {
    id: 200,
    isFork: true,
    owner: author,
    parentRepositoryId: rootId,
  });
});

const invalidCandidates = [
  ['organization Root', { owner: { ...author, type: 'Organization' } }],
  ['organization fork', {
    fork: true, id: 200,
    owner: { ...author, type: 'Organization' }, parent: { id: rootId },
  }],
  ['Root owner mismatch', { owner: { ...author, id: 99 } }],
  ['fork owner mismatch', {
    fork: true, id: 200, owner: { ...author, id: 99 }, parent: { id: rootId },
  }],
  ['downstream fork with Root source', {
    fork: true, id: 200, parent: { id: 300 }, source: { id: rootId },
  }],
  ['unrelated fork with matching name', { fork: true, id: 200, parent: { id: 999 } }],
  ['unrelated non-fork with matching name', { id: 200 }],
  ['fork without parent', { fork: true, id: 200 }],
] as const;

for (const [name, overrides] of invalidCandidates) {
  test(`rejects ${name}`, async () => {
    assert.equal(
      await clientFor(repository(overrides)).resolveRequesterNode(
        author, rootId, 'station',
      ),
      null,
    );
  });
}

for (const fork of [false, true]) {
  test(`renamed ${fork ? 'direct fork' : 'Root'} resolves from paginated owner listing`, async () => {
    const requests: string[] = [];

    const candidate = repository({
      fork,
      full_name: 'renamed-owner/renamed-node',
      id: fork ? 200 : rootId,
      name: 'renamed-node',
      owner: { ...author, login: 'renamed-owner' },
      ...(fork ? { parent: { id: rootId } } : {}),
    });

    const client = new GitHubClient({
      fetch: async (url) => {
        requests.push(url);

        if (url.includes('/repos/requester/station')) {
          return new Response('', { status: 404 });
        }

        if (url.includes('/users/') && !url.includes('page=2')) {
          return new Response(JSON.stringify([repository({ id: 999 })]), {
            headers: {
              link: '<https://api.github.com/users/requester/repos?per_page=100&page=2>; rel="next"',
            },
          });
        }

        const value = url.includes('/users/') ? [candidate] : candidate;

        return new Response(JSON.stringify(value));
      },
    });

    const node = await client.resolveRequesterNode(author, rootId, 'station');

    assert.equal(node?.id, candidate.id);
    assert.equal(node?.owner.id, author.id);
    assert.ok(requests.some((url) => url.includes('page=2')));
    assert.ok(requests.some((url) => url.endsWith('/repos/renamed-owner/renamed-node')));
  });
}

test('owner-list candidates require current repository revalidation', async () => {
  const client = new GitHubClient({
    fetch: async (url) => {
      if (url.includes('/users/')) {
        const listed = repository({ full_name: 'requester/renamed' });

        return new Response(JSON.stringify([listed]));
      }

      return url.endsWith('/station')
        ? new Response('', { status: 404 })
        : new Response(JSON.stringify(repository({ owner: { ...author, id: 99 } })));
    },
  });

  assert.equal(await client.resolveRequesterNode(author, rootId, 'station'), null);
});

test('GitHub read failure does not become an empty Membership result', async () => {
  const client = new GitHubClient({
    fetch: async () => new Response('', { status: 503 }),
  });

  await assert.rejects(
    client.resolveRequesterNode(author, rootId, 'station'), GitHubReadError,
  );
});
