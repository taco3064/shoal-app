import type useQuickJoin from '~app/join/hooks/useQuickJoin';

type JoinState = ReturnType<typeof useQuickJoin>;
type Stage = NonNullable<JoinState['inspection']>['stages'][number];

export default function StageAction({ join, stage }: { join: JoinState; stage: Stage }) {
  const action = getStageAction(join, stage);

  if (!action) {
    return null;
  }

  return (
    <button
      className="button primary quick-stage-action"
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

function getStageAction(join: JoinState, stage: Stage) {
  if (stage.id === 'identity' && !join.session) {
    return {
      label: join.authenticating ? 'Waiting for GitHub' : 'Sign in with GitHub',
      disabled: !join.enabled || join.authenticating,
      onClick: join.authenticate,
    };
  }

  if (!join.inspection) {
    return undefined;
  }

  const inspection = join.inspection!;

  if (stage.action === 'fork' && inspection.forkUrl) {
    return {
      label: 'Create direct fork',
      disabled: join.busy,
      onClick: () => join.openExternal(inspection.forkUrl!),
    };
  }

  if (stage.action === 'app_access' && inspection.installationUrl) {
    return {
      label: 'Grant App access',
      disabled: join.busy,
      onClick: () => join.openExternal(inspection.installationUrl!),
    };
  }

  if (stage.action === 'execute') {
    return {
      label: 'Complete setup automatically',
      disabled:
        join.busy
        || Boolean(inspection.blockedReason)
        || Boolean(join.job && join.job.status !== 'complete'),
      onClick: join.execute,
    };
  }

  return undefined;
}

export function getMapAction(join: JoinState, stage: Stage) {
  const action = getStageAction(join, stage);

  if (action) {
    return action;
  }

  if (stage.action === 'policy') {
    return {
      label: 'Review Policy',
      disabled: join.busy,
      onClick: () => {
        document.getElementById('quick-policy-title')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      },
    };
  }

  return undefined;
}
