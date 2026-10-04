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
    || join.job?.status === 'failed' || join.job?.status === 'blocked');

  // Station and Policy confirmations already advance after verified read-back.
  // Their Local / CLI mode still needs a way to inspect external changes.
  if (!retry && !localMode && (stage.action === 'execute' || stage.action === 'policy')) {
    return null;
  }

  const terminal = stage.id === 'ready' && stage.state === 'complete';

  return (
    <div className="quick-stage-progression">
      <button
        type="button"
        className={terminal ? 'quick-inspect-utility' : 'button quick-continue'}
        disabled={join.busy}
        onClick={() => void join.refresh()}
      >
        {retry ? 'Check again' : terminal ? 'Refresh status' : 'Continue'}
      </button>
    </div>
  );
}
