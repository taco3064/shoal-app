import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import PolicyStep from './PolicyStep';

type JoinState = ReturnType<typeof useQuickJoin>;

export default function StationStatus({ join }: { join: JoinState }) {
  const inspection = join.inspection!;

  return (
    <>
      <p>
        Authenticated as
        {' '}
        <strong>{inspection.identity.login}</strong>
      </p>
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
      <h3>
        {join.executionStages
          ? 'Stages before this execution'
          : 'Current onboarding stages'}
      </h3>
      <ul className="quick-stages">
        {(join.executionStages ?? inspection.stages).map((stage) => (
          <li key={stage.id} data-state={stage.state}>
            <strong>{stage.label}</strong>
            <span>
              {stage.state === 'complete' ? 'Already verified' : stage.state}
            </span>
            <p>{stage.detail}</p>
          </li>
        ))}
      </ul>
      {inspection.blockedReason && (
        <p className="quick-warning">{inspection.blockedReason}</p>
      )}
      {inspection.forkUrl && (
        <p>
          <a
            className="button external"
            href={inspection.forkUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Create your direct fork on GitHub
          </a>
        </p>
      )}
      {inspection.installationUrl && (
        <p>
          <a
            className="button external"
            href={inspection.installationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Grant App access to this Reviewer Node
          </a>
        </p>
      )}
      {(inspection.forkUrl || inspection.installationUrl) && (
        <p>
          Waiting for you on GitHub. Return here and refresh after completing
          this step.
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
            Confirm these setup operations
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
