import type useQuickJoin from '~app/join/hooks/useQuickJoin';

type JoinState = ReturnType<typeof useQuickJoin>;
type Stage = NonNullable<JoinState['inspection']>['stages'][number];

export default function StageProgression({ join, stage, localMode }: {
  join: JoinState;
  stage: Stage;
  localMode: boolean;
}) {
  if (!join.session || join.job?.status === 'queued'
    || join.job?.status === 'running' || stage.state === 'executing') {
    return null;
  }

  const retry = Boolean(join.error || join.stale
    || (join.externalRecovery
      && (stage.action === 'fork' || stage.action === 'app_access'))
    || join.job?.status === 'failed' || join.job?.status === 'blocked');

  // Primary actions advance after authoritative inspection or verified read-back.
  // Recovery and Local / CLI mode still need a manual inspection fallback.
  const automatic = stage.action === 'fork' || stage.action === 'app_access'
    || stage.action === 'execute' || stage.action === 'policy';

  if (!retry && !localMode && automatic) {
    return null;
  }

  const terminal = stage.id === 'ready' && stage.state === 'complete';

  const label = retry || (!terminal && localMode)
    ? 'Check again'
    : terminal ? 'Refresh status' : 'Continue';

  return (
    <div className="quick-stage-progression">
      <button
        type="button"
        className={terminal ? 'quick-inspect-utility' : 'button quick-continue'}
        disabled={join.busy}
        onClick={() => void join.refresh()}
      >
        {label}
      </button>
    </div>
  );
}
