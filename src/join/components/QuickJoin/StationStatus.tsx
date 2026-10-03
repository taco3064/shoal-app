import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import PolicyStep from './PolicyStep';

type JoinState = ReturnType<typeof useQuickJoin>;

export default function StationStatus({ join }: { join: JoinState }) {
  const inspection = join.inspection!;

  if (inspection.rootOwner) {
    return (
      <section className="quick-ready" aria-labelledby="root-owner-title">
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
      {inspection.node && (
        <p>
          Reviewer Node:
          {' '}
          <a
            href={inspection.node.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {inspection.node.fullName}
          </a>
          {' '}
          · Repository ID
          {' '}
          {inspection.node.id}
        </p>
      )}
      <h3>Current onboarding journey</h3>
      <ul className="quick-stages">
        {(join.executionStages ?? inspection.stages).map((stage) => (
          <li key={stage.id} data-state={stage.state}>
            <strong>{stage.label}</strong>
            <span>
              {stage.state === 'complete' ? 'Verified' : stage.state}
            </span>
            <p>{stage.detail}</p>
            {stage.facts && (
              <ul className="quick-facts">
                {stage.facts.map((fact) => (
                  <li key={fact.label} data-state={fact.state}>
                    <strong>{fact.label}</strong>
                    <span>{fact.state}</span>
                    <p>{fact.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {inspection.blockedReason && (
        <p className="quick-warning">{inspection.blockedReason}</p>
      )}
      {inspection.forkUrl && (
        <p>
          <button
            className="button external"
            onClick={() => join.openExternal(inspection.forkUrl!)}
          >
            Create your direct fork on GitHub
          </button>
        </p>
      )}
      {inspection.installationUrl && (
        <p>
          <button
            className="button external"
            onClick={() => join.openExternal(inspection.installationUrl!)}
          >
            Grant App access to this Reviewer Node
          </button>
        </p>
      )}
      {(inspection.forkUrl || inspection.installationUrl) && (
        <p>
          Waiting for you on GitHub. Returning to this page refreshes
          authoritative state; Refresh status remains available.
        </p>
      )}
      {inspection.operations.length > 0 && (
        <section aria-labelledby="quick-plan-title">
          <h3 id="quick-plan-title">Remaining setup operations</h3>
          <p>
            Only this plan is authorized by your confirmation. README.md is
            preserved.
          </p>
          <ol>
            {inspection.operations.map((operation) => (
              <li key={operation.id}>{operation.label}</li>
            ))}
          </ol>
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
          <button
            className="button primary"
            disabled={
              join.busy
              || Boolean(inspection.blockedReason)
              || Boolean(join.job && join.job.status !== 'complete')
            }
            onClick={join.execute}
          >
            Complete remaining setup automatically
          </button>
        </section>
      )}
      {inspection.ready && (
        <section className="quick-ready" aria-labelledby="quick-ready-title">
          <h3 id="quick-ready-title">Your station is ready</h3>
          <p>
            Issues and admitted form/Workflow digests are verified. Readiness
            does not prove Workflow executability.
            {inspection.operations.length === 0 && !join.job
              ? 'No setup commit or settings mutation is needed.'
              : ''}
          </p>
          {inspection.operations.length > 0 && (
            <p>
              Quick Web Join setup is still pending. Review and confirm the
              remaining operations above, including any Actions or Workflow
              activation.
            </p>
          )}
          <p>
            Directory publication is waiting for a separate successful Network
            Scan and publication. Readiness does not guarantee a publication
            deadline.
          </p>
        </section>
      )}
      {inspection.ready && !inspection.blockedReason && (
        <PolicyStep join={join} />
      )}
    </>
  );
}
