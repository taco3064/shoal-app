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
            Public browsing stays open. Local / CLI setup remains available
            inside the same stages when you prefer not to authorize the Website.
          </p>
        </div>
        <div className="quick-auth">
          {join.session
            ? (
                <>
                  <button
                    className="button external"
                    disabled={join.busy}
                    onClick={() => void join.logout()}
                  >
                    Sign out
                  </button>
                  <p>
                    Signed in as
                    {' '}
                    <strong>{join.session.identity.login}</strong>
                  </p>
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
          Quick Web Join is not configured on this deployment. The same staged
          journey still shows the Local / CLI path.
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
    </section>
  );
}
