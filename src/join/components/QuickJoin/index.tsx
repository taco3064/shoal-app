import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import StationStatus from './StationStatus';

type JoinState = ReturnType<typeof useQuickJoin>;

export default function QuickJoin({ join }: { join: JoinState }) {
  return (
    <section className="quick-join" aria-labelledby="quick-join-title">
      <div className="quick-join-heading">
        <div>
          <p className="section-kicker">OPTIONAL GITHUB AUTHORIZATION</p>
          <h2 id="quick-join-title">Quick Web Join</h2>
          <p>
            Let Shoal inspect your station and show only the setup still needed.
            You confirm every remaining setup plan and any separate Policy
            write.
          </p>
          <p>
            Public browsing stays open. Prefer local setup? Use Local / CLI Join
            below.
          </p>
        </div>
        <div className="quick-auth">
          {join.session
            ? (
                <>
                  <p>
                    Signed in as
                    {' '}
                    <strong>{join.session.identity.login}</strong>
                  </p>
                  <button
                    className="button external"
                    disabled={join.busy}
                    onClick={() => void join.logout()}
                  >
                    Sign out
                  </button>
                </>
              )
            : (
                <button
                  className="button primary"
                  disabled={!join.enabled || join.authenticating}
                  onClick={join.authenticate}
                >
                  {join.authenticating ? 'Waiting for GitHub' : 'Sign in with GitHub'}
                </button>
              )}
        </div>
      </div>
      {!join.configured && (
        <p>
          Quick Web Join is not configured on this deployment. Local / CLI Join
          remains available.
        </p>
      )}
      {!join.session && (
        <p>
          {join.authenticating
            ? 'Waiting for GitHub authorization. You may cancel and use local setup.'
            : 'Authorization is optional; public pages and local setup stay open.'}
        </p>
      )}
      {join.authenticating && (
        <button className="button" onClick={join.cancelAuth}>
          Cancel authorization
        </button>
      )}
      {join.error && (
        <p role="alert" className="quick-warning">
          {join.error}
        </p>
      )}
      {join.stale && (
        <p>
          The confirmed plan is stale. Refresh authoritative state and review a
          new plan before confirming again.
        </p>
      )}
      {join.busy && !join.job && (
        <p role="status">Inspecting current GitHub state…</p>
      )}
      <StationStatus join={join} />
      {join.job && <Progress join={join} />}
      {join.session && (
        <div className="actions">
          <button
            className="button"
            disabled={join.busy}
            onClick={() => void join.refresh()}
          >
            {join.error
              || join.job?.status === 'failed'
              || join.job?.status === 'blocked'
              ? 'Refresh and retry remaining work'
              : 'Refresh status'}
          </button>
        </div>
      )}
    </section>
  );
}

function Progress({ join }: { join: JoinState }) {
  const job = join.job!;

  return (
    <section
      className="quick-progress"
      aria-labelledby="quick-progress-title"
      aria-live="polite"
    >
      <h3 id="quick-progress-title">
        Setup progress ·
        {' '}
        {job.status}
      </h3>
      <progress
        value={job.progress.completed}
        max={Math.max(1, job.progress.total)}
        aria-label="Verified operations"
      />
      <p>
        {job.progress.completed}
        {' '}
        /
        {job.progress.total}
        {' '}
        operations verified
      </p>
      {job.progress.currentOperation && (
        <p>
          Running:
          {' '}
          {job.progress.currentOperation.replaceAll('_', ' ')}
        </p>
      )}
      <ul>
        {job.progress.operations?.map((operation) => (
          <li key={operation.name}>
            {operation.name.replaceAll('_', ' ')}
            :
            {' '}
            {operation.state}
            {operation.error && <p>{operation.error}</p>}
          </li>
        ))}
        {!job.progress.operations
          && job.progress.verifiedOperations.map((operation) => (
            <li key={operation}>
              Verified:
              {' '}
              {operation.replaceAll('_', ' ')}
            </li>
          ))}
      </ul>
      <p>
        Progress advances only after GitHub read-back verifies each operation.
      </p>
      {(job.status === 'failed' || job.status === 'blocked') && (
        <p>
          Completed work is preserved. Progress is frozen at the last verified
          operation. Refresh to inspect and retry only remaining work.
        </p>
      )}
    </section>
  );
}
