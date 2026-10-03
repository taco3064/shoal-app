import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import LocalStageGuidance from './LocalStageGuidance';
import PolicyStep from './PolicyStep';
import StatusIcon from './StatusIcon';

type JoinState = ReturnType<typeof useQuickJoin>;
type Inspection = NonNullable<JoinState['inspection']>;
type Stage = NonNullable<JoinState['inspection']>['stages'][number];

const stateLabels: Record<Stage['state'], string> = {
  available: 'Ready for you',
  blocked: 'Blocked',
  complete: 'Verified',
  current: 'Current step',
  executing: 'In progress',
  failed: 'Needs retry',
  waiting: 'Locked',
};

export default function StationStatus({ join }: { join: JoinState }) {
  const inspection = join.inspection ?? previewInspection();
  const preview = !join.inspection;

  if (inspection.rootOwner) {
    return (
      <section className="quick-root-owner" aria-labelledby="root-owner-title">
        <span className="quick-root-mark" aria-hidden="true">✓</span>
        <h3 id="root-owner-title">Network Root owner</h3>
        <p>You’re signed in as the Network Root owner.</p>
        <p>
          The Network Root is already your Reviewer Node, so Quick Web Join is
          not required for this account.
        </p>
      </section>
    );
  }

  const stages = join.executionStages ?? inspection.stages;
  const activeStage = selectActiveStage(stages);

  if (!activeStage) {
    return null;
  }

  const activeIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === activeStage.id),
  );

  return (
    <>
      <div className="quick-journey-heading">
        <div>
          <p className="section-kicker">GUIDED JOIN JOURNEY</p>
          <h3>Current onboarding journey</h3>
          {preview && (
            <p>
              Sign in with GitHub to hydrate these stages with authoritative
              station state.
            </p>
          )}
        </div>
        {inspection.node && (
          <a
            className="quick-node-link"
            href={inspection.node.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {inspection.node.fullName}
          </a>
        )}
      </div>
      <section
        className="quick-current-step"
        data-state={activeStage.state}
        data-preview={preview ? 'true' : 'false'}
        aria-labelledby="quick-current-step-title"
      >
        <div className="quick-current-index" aria-hidden="true">
          {String(activeIndex + 1).padStart(2, '0')}
        </div>
        <div className="quick-current-body">
          <div className="quick-stage-topline">
            <span className="quick-stage-state">
              {stateLabels[activeStage.state]}
            </span>
          </div>
          <h4 id="quick-current-step-title">{activeStage.label}</h4>
          <p>{activeStage.detail}</p>
          <LocalStageGuidance stage={activeStage} />
          {!preview && <StageAction join={join} stage={activeStage} />}
          {activeStage.id === 'station' && inspection.operations.length > 0 && (
            <div className="quick-stage-plan">
              <p>Automatic completion will verify:</p>
              <ol>
                {inspection.operations.map((operation) => (
                  <li key={operation.id}>{operation.label}</li>
                ))}
              </ol>
            </div>
          )}
          {!preview
            && activeStage.id === 'policy'
            && activeStage.action === 'policy' && <PolicyStep join={join} />}
          {activeStage.id === 'ready' && inspection.ready && (
            <div className="quick-publication">
              <p>
                Directory publication waits for a separate successful Network
                Scan and publication. Readiness does not guarantee a publication
                deadline.
              </p>
            </div>
          )}
          {activeStage.facts && <StageFacts facts={activeStage.facts} />}
        </div>
      </section>
      <ol className="quick-progress-map" aria-label="Join progress">
        {stages.map((stage, index) => {
          const actionable = getMapAction(join, stage);

          const content = (
            <>
              <span className="quick-map-marker" aria-hidden="true">
                <StatusIcon state={stage.state} />
              </span>
              <span className="quick-map-step">
                {String(index + 1).padStart(2, '0')}
              </span>
              <strong>{stage.label}</strong>
              <span className="quick-map-state">{stateLabels[stage.state]}</span>
              <small>{localCue(stage)}</small>
            </>
          );

          return (
            <li
              key={stage.id}
              data-state={stage.state}
              data-active={stage.id === activeStage.id ? 'true' : 'false'}
              data-actionable={actionable ? 'true' : 'false'}
            >
              {actionable
                ? (
                    <button
                      type="button"
                      onClick={actionable.onClick}
                      disabled={actionable.disabled}
                    >
                      {content}
                    </button>
                  )
                : (
                    <div>{content}</div>
                  )}
            </li>
          );
        })}
      </ol>
      {!preview && inspection.ready && activeStage.id !== 'ready' && (
        <div className="quick-publication">
          <p>
            Directory publication waits for a separate successful Network Scan
            and publication. Readiness does not guarantee a publication
            deadline.
          </p>
        </div>
      )}
      {inspection.blockedReason && (
        <p className="quick-warning">{inspection.blockedReason}</p>
      )}
      {(inspection.forkUrl || inspection.installationUrl) && (
        <p className="quick-return-note">
          Waiting for you on GitHub. Returning to this page refreshes
          authoritative state; Refresh status remains available.
        </p>
      )}
      {inspection.operations.length > 0 && (
        <details className="quick-readback">
          <summary>Technical readback for this setup plan</summary>
          <p>
            Network Root generation:
            {' '}
            <code>{inspection.rootHead}</code>
          </p>
          {inspection.node && (
            <p>
              Reviewer branch head:
              {' '}
              <code>{inspection.node.head}</code>
            </p>
          )}
        </details>
      )}
    </>
  );
}

function previewInspection(): Inspection {
  return {
    planId: '',
    identity: { id: 0, login: '' },
    rootHead: '',
    rootOwner: false,
    stages: [
      {
        id: 'identity',
        label: 'GitHub identity',
        state: 'current',
        detail: 'Sign in with GitHub to begin the authoritative join journey.',
      },
      {
        id: 'node',
        label: 'Reviewer Node / direct fork',
        state: 'waiting',
        detail: 'Shoal checks for your direct Personal Account fork after sign-in.',
      },
      {
        id: 'access',
        label: 'GitHub App repository access',
        state: 'waiting',
        detail: 'If needed, you grant the App access only to your Reviewer Node.',
      },
      {
        id: 'station',
        label: 'Station setup',
        state: 'waiting',
        detail: 'Shoal shows remaining setup only after inspecting GitHub state.',
      },
      {
        id: 'policy',
        label: 'Review Policy',
        state: 'waiting',
        detail: 'Policy authorship remains yours and is confirmed separately.',
      },
      {
        id: 'ready',
        label: 'Station ready / publication waiting',
        state: 'waiting',
        detail: 'Readiness and Directory publication appear after verification.',
      },
    ],
    operations: [],
    ready: false,
  };
}

function selectActiveStage(stages: Stage[]) {
  return (
    stages.find((stage) => stage.state === 'current')
    ?? stages.find((stage) => stage.state === 'available')
    ?? stages.find((stage) => stage.state === 'executing')
    ?? stages.find((stage) => stage.state === 'failed')
    ?? stages.find((stage) => stage.state === 'blocked')
    ?? stages.find((stage) => stage.state === 'waiting')
    ?? stages[stages.length - 1]
  );
}

function StageFacts({ facts }: { facts: NonNullable<Stage['facts']> }) {
  return (
    <ul className="quick-facts">
      {facts.map((fact) => (
        <li key={fact.label} data-state={fact.state}>
          <span className="quick-fact-mark" aria-hidden="true">
            <StatusIcon state={fact.state} />
          </span>
          <strong>{fact.label}</strong>
          <span>{stateLabels[fact.state]}</span>
          <p>{fact.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function StageAction({ join, stage }: { join: JoinState; stage: Stage }) {
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
      disabled: false,
      onClick: () => join.openExternal(inspection.forkUrl!),
    };
  }

  if (stage.action === 'app_access' && inspection.installationUrl) {
    return {
      label: 'Grant App access',
      disabled: false,
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

function getMapAction(join: JoinState, stage: Stage) {
  const action = getStageAction(join, stage);

  if (action) {
    return action;
  }

  if (stage.action === 'policy') {
    return {
      label: 'Review Policy',
      disabled: false,
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

function localCue(stage: Stage) {
  switch (stage.id) {
    case 'identity':
      return 'Website auth optional';
    case 'node':
      return 'Direct fork also works locally';
    case 'access':
      return 'Local setup can skip Website mutation access';
    case 'station':
      return 'Local path: gh shoal init';
    case 'policy':
      return 'Local path: edit README.md';
    case 'ready':
      return 'Same readiness either way';
    default:
      return '';
  }
}
