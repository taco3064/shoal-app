import assert from 'node:assert/strict';
import test from 'node:test';

import {
  networkRoot,
  requestFormPath,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';

import { createStationJoinService, publicInspection } from './index';
import { githubFixture } from './test_github';

const token = 'user-token';

function mutationCount(state: ReturnType<typeof githubFixture>['state']) {
  return state.requests.filter(
    (request) =>
      request.method !== 'GET' && !request.path.endsWith('/access_tokens'),
  ).length;
}

test('drift converges in one managed commit with verified progress', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const inspection = await service.inspect(token);

  assert.deepEqual(inspection.operations, [
    'enable_issues',
    'enable_actions',
    'sync_managed_files',
    'enable_workflow',
  ]);

  assert.equal(inspection.repository?.id, 100);
  assert.equal(inspection.rootHead, 'root-generation');

  const completed: number[] = [];

  const result = await service.execute(token, inspection, (progress) => {
    completed.push(progress.completed);
  });

  assert.equal(result.ready, true);
  assert.equal(result.total, 4);
  assert.equal(result.completed, 4);
  assert.deepEqual([...new Set(completed)], [0, 1, 2, 3, 4]);
  assert.equal(state.files['README.md'], '# My existing policy\n');
  assert.equal(state.files['notes.txt'], 'untouched');
  assert.equal(state.parent, 'node-parent');

  assert.deepEqual(
    state.pendingTree.map((file) => file.path),
    [requestFormPath, summaryWorkflowPath],
  );

  assert.equal(
    state.requests.filter(
      (request) =>
        request.path.endsWith('/git/commits') && request.method === 'POST',
    ).length,
    1,
  );

  assert.deepEqual(
    state.requests.find((request) =>
      request.path.endsWith('/git/refs/heads/main'),
    )?.body,
    { sha: 'new-commit', force: false },
  );

  assert.deepEqual(state.actions, {
    enabled: true,
    allowed_actions: 'selected',
    sha_pinning_required: true,
  });

  const narrow = state.requests.filter((request) =>
    request.path.endsWith('/access_tokens'),
  );

  assert.ok(
    narrow.every(
      (request) => JSON.stringify(request.body?.repository_ids) === '[100]',
    ),
  );

  assert.ok(
    narrow.some(
      (request) =>
        JSON.stringify(request.body?.permissions)
        === '{"metadata":"read","administration":"write"}',
    ),
  );

  assert.ok(
    narrow.some(
      (request) =>
        JSON.stringify(request.body?.permissions)
        === '{"metadata":"read","contents":"write","workflows":"write"}',
    ),
  );

  const before = mutationCount(state);
  const retry = await service.execute(token, await service.inspect(token));

  assert.equal(retry.completed, 0);
  assert.equal(retry.total, 0);
  assert.equal(retry.ready, true);
  assert.equal(mutationCount(state), before);

  assert.ok(
    !JSON.stringify(publicInspection(result.inspection)).includes(
      'installation-',
    ),
  );
});

test('fork and selected-repository access are external prerequisites', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.repoGone = true;
  assert.equal((await service.inspect(token)).waiting, 'fork');
  state.repoGone = false;
  state.installed = false;
  assert.equal((await service.inspect(token)).waiting, 'app_access');
  assert.equal(mutationCount(state), 0);

  assert.ok(
    !state.requests.some(
      (request) => request.method === 'POST' && request.path.endsWith('/forks'),
    ),
  );
});

test('invalid ownership and membership are rejected', async () => {
  for (const variant of ['root', 'organization', 'downstream', 'ordinary']) {
    const { client, state } = githubFixture();

    if (variant === 'root') {
      {
        state.node.id = networkRoot.repositoryId;
      }
    }

    if (variant === 'organization') {
      state.node.owner = {
        id: 42,
        login: 'organization',
        type: 'Organization',
      };
    }

    if (variant === 'downstream') {
      {
        state.node.parent = { id: 999 };
      }
    }

    if (variant === 'ordinary') {
      {
        state.node.fork = false;
      }
    }

    assert.equal(
      (await createStationJoinService(client).inspect(token)).waiting,
      'fork',
      variant,
    );

    assert.equal(mutationCount(state), 0);
  }
});

test('unsupported Root cannot replace an admitted workflow', async () => {
  const { client, state } = githubFixture();

  state.files[requestFormPath] = state.rootFiles[requestFormPath];
  state.files[summaryWorkflowPath] = state.rootFiles[summaryWorkflowPath];
  state.rootFiles[summaryWorkflowPath] = 'unadmitted canonical generation';
  state.node.has_issues = true;
  state.actions.enabled = true;
  state.workflow.state = 'active';

  const service = createStationJoinService(client);
  const plan = await service.inspect(token);

  assert.equal(plan.platformBlocked, true);
  assert.deepEqual(plan.operations, []);
  assert.equal(plan.ready, true);
  await service.execute(token, plan);
  assert.equal(mutationCount(state), 0);
});

test('material changes invalidate the displayed confirmation', async () => {
  for (const changed of ['root', 'node', 'actions']) {
    const { client, state } = githubFixture();
    const service = createStationJoinService(client);
    const plan = await service.inspect(token);

    if (changed === 'root') {
      {
        state.rootHead = 'next-generation';
      }
    }

    if (changed === 'node') {
      {
        state.head = 'reviewer-change';
      }
    }

    if (changed === 'actions') {
      {
        state.actions.allowed_actions = 'local';
      }
    }

    await assert.rejects(service.execute(token, plan), /STALE_PLAN/);
    assert.equal(mutationCount(state), 0);
  }
});

test('API acknowledgement cannot advance unverified progress', async () => {
  const { client, state } = githubFixture();

  state.failIssuesReadback = true;

  const service = createStationJoinService(client);
  const result = await service.execute(token, await service.inspect(token));

  assert.equal(result.completed, 0);
  assert.equal(result.operations[0].state, 'failed');
  assert.equal(result.operations[1].state, 'queued');
  assert.equal(result.ready, false);
});

test('retry preserves success and skips completed operations', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.failActions = true;

  const result = await service.execute(token, await service.inspect(token));

  assert.equal(result.completed, 1);
  assert.equal(result.operations[0].state, 'verified');
  assert.equal(result.operations[1].state, 'failed');
  assert.equal(state.node.has_issues, true);
  state.failActions = false;

  const retry = await service.inspect(token);

  assert.ok(!retry.operations.includes('enable_issues'));
  assert.equal((await service.execute(token, retry)).ready, true);

  assert.equal(
    state.requests.filter(
      (request) =>
        request.method === 'PATCH'
        && request.path === '/repos/reviewer/renamed-station',
    ).length,
    1,
  );
});

test('concurrent commit survives while managed progress freezes', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.concurrentCommit = true;

  const result = await service.execute(token, await service.inspect(token));

  assert.equal(result.completed, 2);
  assert.equal(result.operations[2].state, 'blocked');
  assert.equal(state.head, 'concurrent-reviewer-commit');
  assert.equal(state.files[requestFormPath], 'drifted form');

  assert.ok(
    !state.requests.some((request) =>
      request.path.endsWith('/git/refs/heads/main'),
    ),
  );
});

test('Policy no-op acceptance and explicit README-only customization', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.files['README.md'] = state.rootFiles['README.md'];

  const first = await service.preparePolicy(
    token,
    await service.inspect(token),
    { kind: 'default' },
  );

  assert.equal(first.noop, true);
  await service.executePolicy(token, first);
  assert.equal(mutationCount(state), 0);

  const second = await service.preparePolicy(
    token,
    await service.inspect(token),
    { kind: 'custom', content: '# Custom confirmed policy\n' },
  );

  const result = await service.executePolicy(token, second);

  assert.equal(result.completed, 1);
  assert.equal(state.files['README.md'], '# Custom confirmed policy\n');

  assert.deepEqual(
    state.pendingTree.map((file) => file.path),
    ['README.md'],
  );

  assert.equal(state.files[requestFormPath], 'drifted form');

  const permission = state.requests
    .filter((request) => request.path.endsWith('/access_tokens'))
    .find(
      (request) =>
        JSON.stringify(request.body?.permissions)
        === '{"metadata":"read","contents":"write"}',
    );

  assert.ok(permission);
});

test('Policy guard rejects head or README changes', async () => {
  for (const changed of ['head', 'readme']) {
    const { client, state } = githubFixture();
    const service = createStationJoinService(client);
    const displayed = await service.inspect(token);

    const keep = await service.preparePolicy(token, displayed, {
      kind: 'keep',
    });

    assert.equal(keep.noop, true);

    const plan = await service.preparePolicy(token, displayed, {
      kind: 'default',
    });

    if (changed === 'head') {
      {
        state.head = 'new-reviewer-head';
      }
    }

    if (changed === 'readme') {
      {
        state.files['README.md'] = '# Concurrent edit';
      }
    }

    await assert.rejects(service.executePolicy(token, plan), /STALE_PLAN/);
    assert.equal(mutationCount(state), 0);
  }
});

test('content allowlist refuses outside paths before token minting', async () => {
  const { client, state } = githubFixture();
  const plan = await createStationJoinService(client).inspect(token);
  const requests = state.requests.length;

  await assert.rejects(
    client.commitFiles(
      plan.binding!,
      plan.nodeHead!,
      [{ path: 'README.md', content: 'bad automatic rewrite' }],
      'managed',
      async () => undefined,
    ),
    /allowlist/,
  );

  assert.equal(state.requests.length, requests);
});
