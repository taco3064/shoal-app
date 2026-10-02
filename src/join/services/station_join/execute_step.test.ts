import assert from 'node:assert/strict';
import test from 'node:test';

import { createStationJoinService, type ExecutionCheckpoint } from './index';
import { githubFixture } from './test_github';

test('durable steps fit Free-plan subrequests and public API rate budget', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const authenticated = { ...state.user };
  const plan = await service.inspect(authenticated);

  let checkpoint: ExecutionCheckpoint = {
    plan,
    inspection: plan,
    operations: plan.operations.map((name) => ({ name, state: 'queued' })),
  };

  for (let completed = 1; completed <= 4; completed++) {
    const before = state.requests.length;
    const step = await service.executeStep(authenticated, checkpoint);

    assert.ok(state.requests.length - before < 50);
    assert.equal(step.result.completed, completed);
    assert.equal(step.done, completed === 4);
    checkpoint = JSON.parse(JSON.stringify(step.checkpoint)) as ExecutionCheckpoint;
  }

  assert.equal(checkpoint.inspection.ready, true);

  assert.equal(
    state.requests.filter((request) => request.path.endsWith('/forks')).length,
    1,
  );

  assert.ok(state.requests.filter((request) => request.token === '').length < 60);
  assert.equal(state.files['README.md'], '# My existing policy\n');
  assert.equal(state.files['notes.txt'], 'untouched');
});

test('Root changes between alarms invalidate confirmed continuation', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const plan = await service.inspect(state.user);

  const first = await service.executeStep(state.user, {
    plan,
    inspection: plan,
    operations: plan.operations.map((name) => ({ name, state: 'queued' })),
  });

  state.rootHead = 'next-root-generation';

  const before = state.requests.length;

  await assert.rejects(service.executeStep(state.user, first.checkpoint), /STALE_PLAN/);

  assert.ok(
    !state.requests.slice(before).some((request) =>
      request.method !== 'GET' && !request.path.endsWith('/access_tokens'),
    ),
  );

  assert.equal(state.actions.enabled, false);
});

test('failed readback ends the durable job without replaying prior success', async () => {
  const { client, state } = githubFixture();
  const service = createStationJoinService(client);
  const plan = await service.inspect(state.user);

  const first = await service.executeStep(state.user, {
    plan,
    inspection: plan,
    operations: plan.operations.map((name) => ({ name, state: 'queued' })),
  });

  state.failActions = true;

  const second = await service.executeStep(state.user, first.checkpoint);

  assert.equal(second.done, true);
  assert.equal(second.result.completed, 1);
  assert.equal(second.result.operations[0].state, 'verified');
  assert.equal(second.result.operations[1].state, 'failed');
  assert.equal(state.head, 'node-parent');
});
