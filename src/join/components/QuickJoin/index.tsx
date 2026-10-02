import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import StationStatus from './StationStatus';

type JoinState = ReturnType<typeof useQuickJoin>;

export default function QuickJoin({ join }: { join: JoinState }) {
  return (
    <section className="quick-join" aria-labelledby="quick-join-title">
      <p className="section-kicker">OPTIONAL GITHUB AUTHORIZATION</p>
      <h2 id="quick-join-title">Quick Web Join</h2>
      <p>
        Let Shoal inspect your station and show only the setup still needed. You
        confirm every remaining setup plan and any separate Policy write.
      </p>
      <p>
        Public browsing stays open. Prefer local setup? Follow Local / CLI Join
        below.
      </p>
      <button
        className="button primary"
        disabled={!join.enabled}
        onClick={join.session ? join.show : join.authenticate}
      >
        {join.session ? 'Open station status' : 'Continue with GitHub'}
      </button>
      {!join.configured && (
        <p>
          Quick Web Join is not configured on this deployment. Local / CLI Join
          remains available.
        </p>
      )}
      <dialog
        ref={join.dialog}
        className="quick-dialog"
        aria-labelledby="quick-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          join.close();
        }}
      >
        <div className="quick-dialog-heading">
          <h2 id="quick-dialog-title">Station status</h2>
          <button
            className="button"
            onClick={join.close}
            aria-label="Close station status"
          >
            Close
          </button>
        </div>
        {!join.session && (
          <p>
            {join.authenticating
              ? 'Waiting for GitHub authorization. You may cancel and use local setup.'
              : 'Authorization is optional; public pages and local setup stay open.'}
          </p>
        )}
        {!join.session && !join.authenticating && (
          <button className="button primary" onClick={join.authenticate}>
            Authorize with GitHub
          </button>
        )}
        {join.error && (
          <p role="alert" className="quick-warning">
            {join.error}
          </p>
        )}
        {join.stale && (
          <p>
            The confirmed plan is stale. Refresh authoritative state and review
            a new plan before confirming again.
          </p>
        )}
        {join.busy && !join.job && (
          <p role="status">Inspecting current GitHub state…</p>
        )}
        {join.inspection && <StationStatus join={join} />}
        {join.job && (
          <section
            className="quick-progress"
            aria-labelledby="quick-progress-title"
            aria-live="polite"
          >
            <h3 id="quick-progress-title">
              Setup progress ·
              {' '}
              {join.job.status}
            </h3>
            <progress
              value={join.job.progress.completed}
              max={Math.max(1, join.job.progress.total)}
              aria-label="Verified operations"
            />
            <p>
              {join.job.progress.completed}
              {' '}
              /
              {join.job.progress.total}
              {' '}
              operations verified
            </p>
            {join.job.progress.currentOperation && (
              <p>
                Running:
                {' '}
                {join.job.progress.currentOperation.replaceAll('_', ' ')}
              </p>
            )}
            <ul>
              {join.job.progress.operations?.map((operation) => (
                <li key={operation.name}>
                  {operation.name.replaceAll('_', ' ')}
                  :
                  {' '}
                  {operation.state}
                  {operation.error && <p>{operation.error}</p>}
                </li>
              ))}
              {!join.job.progress.operations
                && join.job.progress.verifiedOperations.map((operation) => (
                  <li key={operation}>
                    Verified:
                    {' '}
                    {operation.replaceAll('_', ' ')}
                  </li>
                ))}
            </ul>
            <p>
              Progress advances only after GitHub read-back verifies each
              operation.
            </p>
            {(join.job.status === 'failed'
              || join.job.status === 'blocked') && (
              <p>
                Completed work is preserved. Progress is frozen at the last
                verified operation. Refresh to inspect and retry only remaining
                work.
              </p>
            )}
          </section>
        )}
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
                : 'Refresh GitHub state'}
            </button>
            <button
              className="button external"
              disabled={join.busy}
              onClick={() => void join.logout()}
            >
              Sign out
            </button>
          </div>
        )}
      </dialog>
    </section>
  );
}
