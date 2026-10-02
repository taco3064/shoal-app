import { verified } from './verification';
import type {
  ExecutionCheckpoint,
  ExecutionStep,
  Inspection,
  OperationName,
  ProgressObserver,
} from './types';

export function fingerprint(inspection: Inspection): string {
  return JSON.stringify({
    identity: inspection.identity.id,
    node: inspection.repository?.id,
    branch: inspection.repository?.default_branch,
    nodeHead: inspection.nodeHead,
    rootHead: inspection.rootHead,
    rootBranch: inspection.root.default_branch,
    installation: inspection.binding?.installationId,
    issues: inspection.repository?.has_issues,
    actions: inspection.actions,
    workflow: inspection.workflow,
    operations: inspection.operations,
    waiting: inspection.waiting,
    platformBlocked: inspection.platformBlocked,
  });
}

type StepActions = {
  inspect: (previous: Inspection) => Promise<Inspection>;
  perform: (inspection: Inspection, name: OperationName) => Promise<number | undefined>;
  progress?: ProgressObserver;
};

// One durable invocation advances at most one already-confirmed operation.
export async function executeStep(
  checkpoint: ExecutionCheckpoint,
  actions: StepActions,
): Promise<ExecutionStep> {
  const state: ExecutionCheckpoint = {
    ...checkpoint,
    operations: checkpoint.operations.map((operation) => ({ ...operation })),
  };

  const inspection = await actions.inspect(state.inspection);

  if (
    !state.plan.binding
    || state.plan.waiting
    || fingerprint(inspection) !== fingerprint(state.inspection)
  ) {
    throw new Error('STALE_PLAN');
  }

  state.inspection = inspection;

  const operation = state.operations.find((item) => item.state === 'queued');

  const result = () => ({
    inspection: state.inspection,
    operations: state.operations.map((item) => ({ ...item })),
    completed: state.operations.filter((item) => item.state === 'verified').length,
    total: state.operations.length,
    ready: state.inspection.ready,
  });

  if (operation) {
    operation.state = 'executing';

    await actions.progress?.({
      operations: result().operations,
      completed: result().completed,
      total: result().total,
      ready: result().ready,
    });

    try {
      const workflowId = await actions.perform(
        inspection,
        operation.name as OperationName,
      );

      const next = await actions.inspect(inspection);

      if (
        !verified(operation.name, next, state.plan, workflowId)
        || next.rootHead !== state.plan.rootHead
        || (operation.name !== 'sync_managed_files'
          && next.nodeHead !== inspection.nodeHead)
      ) {
        throw new Error('Authoritative read-back did not verify the operation.');
      }

      state.inspection = next;
      operation.state = 'verified';
    } catch (error) {
      operation.state
        = error instanceof Error && error.message === 'STALE_PLAN' ? 'blocked' : 'failed';

      operation.error = error instanceof Error ? error.message : 'Operation failed.';
    }

    await actions.progress?.({
      operations: result().operations,
      completed: result().completed,
      total: result().total,
      ready: result().ready,
    });
  }

  return {
    done: !state.operations.some((item) => item.state === 'queued')
      || state.operations.some(
        (item) => item.state === 'failed' || item.state === 'blocked',
      ),
    result: result(),
    checkpoint: state,
  };
}
