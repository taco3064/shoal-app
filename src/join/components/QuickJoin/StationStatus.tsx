import { useEffect, useState } from 'react';
import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import LocalStageGuidance from './LocalStageGuidance';
import PolicyStep from './PolicyStep';
import StatusIcon from './StatusIcon';
import Progress from './Progress';
import StageProgression from './StageProgression';
import StageAction, { getMapAction } from './StageAction';
import {
  authenticatedPlaceholderInspection,
  previewInspection,
} from './preview_inspection';

type JoinState = ReturnType<typeof useQuickJoin>;
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

const rootOwnerStage: Stage = {
  id: 'root-owner',
  label: 'Network Root owner',
  state: 'complete',
  detail:
    'The Network Root is already your Reviewer Node, '
    + 'so Quick Web Join is not required for this account.',
};

export default function StationStatus({ join }: { join: JoinState }) {
  const [localStageId, setLocalStageId] = useState<string | null>(null);

  const preview = !join.session && !join.inspection;
  const recoveringExecution = !join.inspection && Boolean(join.session && join.job);

  const inspection = join.inspection
    ?? (
      join.session
        ? authenticatedPlaceholderInspection(
            join.session,
            recoveringExecution
              ? 'executing'
              : join.inspectionState === 'failed' ? 'failed' : 'verifying',
          )
        : previewInspection()
    );

  const stages = join.executionStages
    ?? (
      inspection.rootOwner && inspection.stages.length === 0
        ? [rootOwnerStage]
        : inspection.stages
    );

  const activeStage = selectActiveStage(stages);

  if (!activeStage) {
    return null;
  }

  const localStage = localStageId
    ? stages.find((stage) => stage.id === localStageId) ?? null
    : null;

  const displayStage = localStage ?? activeStage;

  const displayIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.id === displayStage.id),
  );

  const localMode = Boolean(localStage);

  useEffect(() => {
    if (localStageId && !stages.some((stage) => stage.id === localStageId)) {
      setLocalStageId(null);
    }
  }, [localStageId, stages]);

  const selectLocalStage = (stage: Stage) => {
    const nextStageId = stage.id === localStage?.id ? null : stage.id;

    setLocalStageId(nextStageId);
  };

  if (inspection.rootOwner) {
    return (
      <section className="quick-root-owner" aria-labelledby="root-owner-title">
        <span className="quick-root-mark" aria-hidden="true">
          <StatusIcon state="complete" />
        </span>
        <h3 id="root-owner-title">Network Root owner</h3>
        <p>You’re signed in as the Network Root owner.</p>
        <p>
          The Network Root is already your Reviewer Node, so Quick Web Join is
          not required for this account.
        </p>
      </section>
    );
  }

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
          {!preview && !join.inspection && (
            <p>
              GitHub identity is verified. Repository state is being checked
              before any setup action is enabled.
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
      <div className="quick-journey-layout">
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
                <span className="quick-map-state">
                  {stateLabels[stage.state]}
                </span>
              </>
            );

            return (
              <li
                key={stage.id}
                data-state={stage.state}
                data-active={stage.id === activeStage.id ? 'true' : 'false'}
                data-local-active={stage.id === localStage?.id ? 'true' : 'false'}
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
                <button
                  className="quick-map-local"
                  type="button"
                  aria-pressed={stage.id === localStage?.id}
                  aria-label={`Show Local / CLI instructions for ${stage.label}`}
                  onClick={() => selectLocalStage(stage)}
                >
                  Local / CLI
                </button>
              </li>
            );
          })}
        </ol>
        <section
          className="quick-current-step"
          data-state={displayStage.state}
          data-local={localMode ? 'true' : 'false'}
          data-terminal={displayStage.id === 'ready' && displayStage.state === 'complete'
            && !localMode
            ? 'true'
            : 'false'}
          data-preview={preview ? 'true' : 'false'}
          aria-labelledby="quick-current-step-title"
        >
          <div className="quick-current-index" aria-hidden="true">
            <span>{String(displayIndex + 1).padStart(2, '0')}</span>
            <StatusIcon state={displayStage.state} />
          </div>
          <div className="quick-current-body">
            <div className="quick-stage-topline">
              {localMode && (
                <span className="quick-stage-mode">
                  Local / CLI mode
                </span>
              )}
              <span className="quick-stage-state">
                {stateLabels[displayStage.state]}
              </span>
            </div>
            <h4 id="quick-current-step-title">{displayStage.label}</h4>
            {localMode && (
              <p className="quick-local-mode-note">
                Local / CLI instructions are available for this canonical
                stage. This does not mark the stage complete; authoritative
                status still comes from GitHub inspection.
              </p>
            )}
            <p>{displayStage.detail}</p>
            {!preview && !localMode && (
              <StageAction join={join} stage={displayStage} />
            )}
            {displayStage.id === 'station'
              && inspection.operations.length > 0
              && !localMode && (
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
              && !localMode
              && displayStage.id === 'policy'
              && displayStage.action === 'policy' && <PolicyStep join={join} />}
            {displayStage.id === 'ready'
              && displayStage.state === 'complete' && !localMode && (
              <div className="quick-completion" role="status">
                <strong>Onboarding complete.</strong>
                <p>
                  Directory publication waits for a separate successful Network
                  Scan and publication. Readiness does not guarantee a
                  publication deadline.
                </p>
              </div>
            )}
            {displayStage.facts && !localMode && (
              <StageFacts facts={displayStage.facts} />
            )}
            {join.job && displayStage.id === activeStage.id && <Progress join={join} />}
            <LocalStageGuidance stage={displayStage} open={localMode} />
            {displayStage.id === activeStage.id && (
              <StageProgression join={join} stage={displayStage} localMode={localMode} />
            )}
          </div>
        </section>
      </div>
      {join.job && displayStage.id !== activeStage.id && <Progress join={join} />}
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
          authoritative state. Verified completion advances this journey
          automatically.
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
