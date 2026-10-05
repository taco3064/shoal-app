import type useHostedSettings from '~app/join/hooks/useHostedSettings';

const grantLabels = {
  disconnected: 'Not connected', connected: 'Connected', expired: 'Expired',
  revoked: 'Revoked', reconsent_required: 'Reconnect required',
  refresh_ambiguous: 'Reconnect required', unavailable: 'Unavailable',
};

export default function CopilotAuthority(
  { hosted }: { hosted: ReturnType<typeof useHostedSettings> },
) {
  const state = hosted.settings!;
  const connected = state.grant === 'connected';

  return (
    <section
      className="hosted-support-panel"
      aria-labelledby="hosted-authority-title"
    >
      <p className="section-kicker">SEPARATE AUTHORIZATION</p>
      <h3 id="hosted-authority-title">Reviewer authority</h3>
      <p className={`hosted-authority-state${connected
        ? ''
        : state.grant === 'disconnected' ? ' is-neutral' : ' is-warning'}`}
      >
        {grantLabels[state.grant]}
      </p>
      <p>
        {connected
          ? 'Your GitHub grant is connected for Hosted Reviewer effects.'
          : 'Connect your GitHub account for Hosted Reviewer effects.'}
        {' '}
        This authorizes permitted Reviewer comments and Star / Unstar effects.
        Saving a mode does not change this authority.
      </p>
      <p className="hosted-muted">
        Copilot access: unverified. Requests use station workflow authority;
        Reviewer authorization does not prove Copilot entitlement.
      </p>
      <label className="hosted-checkbox">
        <input
          type="checkbox"
          checked={hosted.connectConfirmed}
          disabled={hosted.busy || hosted.external}
          onChange={(event) => hosted.setConnectConfirmed(event.target.checked)}
        />
        <span>
          I authorize permitted Hosted Reviewer comments and Star / Unstar effects.
        </span>
      </label>
      <div className="hosted-actions">
        <button
          className="button secondary"
          disabled={hosted.busy || hosted.external || !state.membership
            || !state.authorizationAvailable || !hosted.connectConfirmed}
          onClick={() => void hosted.connect()}
        >
          {state.grant === 'disconnected' ? 'Connect Reviewer' : 'Reconnect Reviewer'}
        </button>
        {state.grant !== 'disconnected' && (
          <button
            className="button hosted-disconnect"
            disabled={hosted.busy || hosted.external || !state.membership}
            onClick={hosted.disconnect}
          >
            Disconnect Reviewer
          </button>
        )}
      </div>
      {connected && (
        <p className="hosted-muted">
          Disconnect revokes Hosted Reviewer authority without changing the saved mode.
        </p>
      )}
      {hosted.external && (
        <div role="status" className="hosted-feedback">
          <p>
            Complete authorization in the GitHub window. Status refreshes on return.
          </p>
          <button className="button secondary" onClick={hosted.cancelExternal}>
            Cancel authorization
          </button>
        </div>
      )}
    </section>
  );
}
