import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import PolicyStep from './PolicyStep';

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

const stateGlyphs: Record<Stage['state'], string> = {
  available: '↗',
  blocked: '!',
  complete: '✓',
  current: '•',
  executing: '…',
  failed: '×',
  waiting: '⌁',
};

export default function StationStatus({ join }: { join: JoinState }) {
  const inspection = join.inspection!;

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

  return (
    <>
      <div className="quick-journey-heading">
        <div>
          <p className="section-kicker">GUIDED JOIN JOURNEY</p>
          <h3>Current onboarding journey</h3>
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
      <ul className="quick-stages">
        {(join.executionStages ?? inspection.stages).map((stage, index) => (
          <li
            key={stage.id}
            className="quick-stage"
            data-state={stage.state}
            data-action={stage.action ?? 'none'}
          >
            <div className="quick-stage-marker" aria-hidden="true">
              <span>{stateGlyphs[stage.state]}</span>
            </div>
            <div className="quick-stage-body">
              <div className="quick-stage-topline">
                <span className="quick-stage-step">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="quick-stage-state">{stateLabels[stage.state]}</span>
              </div>
              <strong className="quick-stage-title">{stage.label}</strong>
              <p>{stage.detail}</p>
              <StageAction join={join} stage={stage} />
              {stage.id === 'station' && inspection.operations.length > 0 && (
                <div className="quick-stage-plan">
                  <p>Automatic completion will verify:</p>
                  <ol>
                    {inspection.operations.map((operation) => (
                      <li key={operation.id}>{operation.label}</li>
                    ))}
                  </ol>
                </div>
              )}
              {stage.id === 'policy' && stage.action === 'policy' && (
                <PolicyStep join={join} />
              )}
              {stage.id === 'ready' && inspection.ready && (
                <div className="quick-publication">
                  <p>
                    Directory publication waits for a separate successful
                    Network Scan and publication. Readiness does not guarantee
                    a publication deadline.
                  </p>
                </div>
              )}
              {stage.facts && (
                <ul className="quick-facts">
                  {stage.facts.map((fact) => (
                    <li key={fact.label} data-state={fact.state}>
                      <span className="quick-fact-mark" aria-hidden="true">
                        {stateGlyphs[fact.state]}
                      </span>
                      <strong>{fact.label}</strong>
                      <span>{stateLabels[fact.state]}</span>
                      <p>{fact.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
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

function StageAction({ join, stage }: { join: JoinState; stage: Stage }) {
  const inspection = join.inspection!;

  if (stage.action === 'fork' && inspection.forkUrl) {
    return (
      <button
        className="button primary quick-stage-action"
        onClick={() => join.openExternal(inspection.forkUrl!)}
      >
        Create direct fork
      </button>
    );
  }

  if (stage.action === 'app_access' && inspection.installationUrl) {
    return (
      <button
        className="button primary quick-stage-action"
        onClick={() => join.openExternal(inspection.installationUrl!)}
      >
        Grant App access
      </button>
    );
  }

  if (stage.action === 'execute') {
    return (
      <button
        className="button primary quick-stage-action"
        disabled={
          join.busy
          || Boolean(inspection.blockedReason)
          || Boolean(join.job && join.job.status !== 'complete')
        }
        onClick={join.execute}
      >
        Complete setup automatically
      </button>
    );
  }

  return null;
}
