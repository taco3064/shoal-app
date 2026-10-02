import assert from 'node:assert/strict';
import test from 'node:test';

import { createStationJoinService, publicInspection } from './index';
import { githubFixture } from './test_github';
import { stationReadiness } from '~app/protocol/services/station_readiness';
import { digest } from './inspection';

test('membership survives absent App access and user authority', async () => {
  for (const installed of [false, true]) {
    for (const admin of [false, undefined]) {
      const { client, state } = githubFixture();
      const service = createStationJoinService(client);

      state.installed = installed;
      state.node.permissions = admin === undefined ? undefined : { admin };

      const inspection = await service.inspect('user-token');
      const displayed = publicInspection(inspection);

      assert.equal(inspection.repository?.id, 100);
      assert.equal(inspection.repository?.owner.id, 42);
      assert.equal(inspection.repository?.parent?.id, state.root.id);
      assert.equal(inspection.waiting, 'app_access');
      assert.equal(displayed.repository?.fullName, 'reviewer/renamed-station');
      assert.equal(displayed.appAccess, false);
      assert.equal(inspection.binding, null);
      assert.deepEqual(inspection.operations, []);
      assert.equal(inspection.ready, false);

      assert.ok(
        !state.requests.some(
          (request) =>
            request.path.endsWith('/access_tokens') || request.method !== 'GET',
        ),
      );

      await assert.rejects(
        service.execute('user-token', inspection),
        /STALE_PLAN/,
      );

      assert.ok(!state.requests.some((request) => request.method !== 'GET'));
    }
  }
});

test('loss of user authority invalidates an authorized installed plan', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const plan = await service.inspect('user-token');

  assert.ok(plan.binding);
  state.node.permissions = { admin: false };

  await assert.rejects(service.execute('user-token', plan), /STALE_PLAN/);

  assert.ok(
    !state.requests.some(
      (request) =>
        request.method !== 'GET' && !request.path.endsWith('/access_tokens'),
    ),
  );

  assert.equal(state.node.has_issues, false);
});

test('broad installation discovery inspects only the owned Root fork', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  const unrelated = {
    ...state.node,
    id: 900,
    full_name: 'reviewer/unrelated-project',
    parent: { id: 987 },
  };

  const anotherOwner = {
    ...state.node,
    id: 901,
    full_name: 'someone/other-root-fork',
    owner: { id: 88, login: 'someone', type: 'User' },
  };

  state.unrelatedOwnedForks = [unrelated];
  state.extraRootForks = [anotherOwner];

  const plan = await service.inspect('user-token');

  assert.equal(plan.repository?.id, 100);

  assert.ok(
    state.requests.some(
      (request) => request.path === `/repos/${state.root.full_name}/forks`,
    ),
  );

  assert.ok(!state.requests.some((request) => request.path === '/user/repos'));

  assert.ok(
    !state.requests.some(
      (request) =>
        request.path.includes('unrelated-project')
        || request.path.includes('other-root-fork'),
    ),
  );

  assert.ok(
    state.requests
      .filter((request) => request.path.endsWith('/access_tokens'))
      .every(
        (request) => JSON.stringify(request.body?.repository_ids) === '[100]',
      ),
  );
});

test('managed token grants Workflow write only for changed workflow', async () => {
  for (const changesWorkflow of [false, true]) {
    const { client, state } = githubFixture();
    const service = createStationJoinService(client);

    if (!changesWorkflow) {
      state.files[state.workflow.path] = state.rootFiles[state.workflow.path];
    }

    const plan = await service.inspect('user-token');
    const result = await service.execute('user-token', plan);

    assert.equal(result.ready, true);
    assert.equal(result.completed, 4);

    const writeTokens = state.requests
      .filter((request) => request.path.endsWith('/access_tokens'))
      .map((request) => request.body?.permissions as Record<string, string>)
      .filter((permissions) => permissions.contents === 'write');

    assert.equal(writeTokens.length, 1);

    assert.deepEqual(
      writeTokens[0],
      changesWorkflow
        ? { metadata: 'read', contents: 'write', workflows: 'write' }
        : { metadata: 'read', contents: 'write' },
    );

    assert.equal(state.pendingTree.length, changesWorkflow ? 2 : 1);

    assert.equal(
      state.pendingTree.some((change) => change.path === state.workflow.path),
      changesWorkflow,
    );
  }
});

test('session identity converges without retaining an OAuth user token', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const authenticated = { ...state.user };

  state.node.permissions = undefined;

  const inspection = await service.inspect(authenticated);

  assert.ok(inspection.binding);
  assert.equal(inspection.waiting, null);

  const result = await service.execute(authenticated, inspection);

  assert.equal(result.ready, true);
  assert.equal(result.completed, 4);
  assert.ok(state.requests.some((request) => request.path === '/user/42'));
  assert.ok(!state.requests.some((request) => request.path === '/user'));

  assert.ok(
    state.requests
      .filter((request) =>
        request.path === '/user/42'
        || request.path === `/repos/${state.root.full_name}`
        || request.path.endsWith('/forks'),
      )
      .every((request) => request.token === ''),
  );

  assert.ok(
    state.requests
      .filter((request) => request.path.endsWith('/access_tokens'))
      .every((request) => JSON.stringify(request.body?.repository_ids) === '[100]'),
  );
});

test('session identity revalidation rejects a changed durable user ID', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const authenticated = { ...state.user };

  state.user.id = 99;

  await assert.rejects(service.inspect(authenticated), /identity mismatch/);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].path, '/user/42');
  assert.equal(state.requests[0].token, '');
});

test('Personal Account ownership loss blocks a session-confirmed plan', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const authenticated = { ...state.user };
  const plan = await service.inspect(authenticated);
  const calls = state.requests.length;

  state.node.owner = { id: 88, login: 'new-owner', type: 'User' };

  await assert.rejects(service.execute(authenticated, plan), /STALE_PLAN/);

  assert.ok(
    !state.requests.slice(calls).some((request) => request.method !== 'GET'),
  );
});

test('verified progress persistence completes before the next mutation', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const authenticated = { ...state.user };
  const plan = await service.inspect(authenticated);
  const persisted: number[] = [];

  const result = await service.execute(authenticated, plan, async (progress) => {
    await new Promise<void>((resolve) => setImmediate(resolve));

    if (progress.completed === 1) {
      assert.equal(state.node.has_issues, true);
      assert.equal(state.actions.enabled, false);
    }

    persisted.push(progress.completed);
  });

  assert.equal(result.completed, 4);
  assert.equal(persisted.at(-1), 4);
});

test('Platform readiness stays ready while Web activation remains pending', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);

  state.node.has_issues = true;
  state.files = { ...state.rootFiles };

  const inspection = await service.inspect('user-token');
  const displayed = publicInspection(inspection);

  const platform = stationReadiness({
    hasIssues: state.node.has_issues,
    formDigest: digest(inspection.files.form),
    workflowDigest: digest(inspection.files.workflow),
  });

  assert.equal(platform.ready, true);
  assert.equal(displayed.ready, platform.ready);
  assert.equal(displayed.actionsEnabled, false);
  assert.equal(displayed.workflowActive, false);
  assert.deepEqual(displayed.operations, ['enable_actions', 'enable_workflow']);

  const result = await service.execute('user-token', inspection);

  assert.equal(result.ready, true);
  assert.equal(result.completed, 2);
  assert.deepEqual(result.inspection.operations, []);
});
