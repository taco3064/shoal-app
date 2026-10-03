import { githubFailure } from '../github_join';
import type { DurableSession, HeldPlan } from './sessions';
import { opaqueId } from './sessions';

export interface Job {
  status: 'running' | 'complete' | 'failed' | 'blocked';
  progress: object;
  result?: object;
  error?: { code: string; message: string };
}

export function plan(
  session: DurableSession,
  id: unknown,
  kind: HeldPlan['kind'],
): HeldPlan {
  const held = session.plan;

  if (
    typeof id !== 'string'
    || !held
    || held.id !== id
    || held.kind !== kind
    || held.expires <= Date.now()
  ) {
    throw new Error('Confirmation plan expired; inspect again');
  }

  return held;
}

export function savePlan(
  session: DurableSession,
  kind: HeldPlan['kind'],
  value: unknown,
): string {
  const id = opaqueId();

  session.plan = { id, kind, value, expires: Date.now() + 300_000 };

  return id;
}

export function stoppedJob(job: Job, error?: unknown): void {
  job.status
    = error instanceof Error && error.message === 'STALE_PLAN'
      ? 'blocked'
      : 'failed';

  job.error = githubFailure(error)?.error ?? {
    code:
      error instanceof Error && error.message === 'STALE_PLAN'
        ? 'STALE_PLAN'
        : 'EXECUTION_STOPPED',
    message:
      'Execution stopped. Inspect again for verified progress and a fresh plan.',
  };
}

export function clearRepositoryState(session: DurableSession): void {
  delete session.plan;
  delete session.job;
  delete session.execution;
  delete session.policyDecision;
  session.busy = false;
}
