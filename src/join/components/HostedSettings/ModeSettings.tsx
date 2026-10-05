import type useHostedSettings from '~app/join/hooks/useHostedSettings';

const modes = [
  { value: 'none', title: 'None',
    description: 'No Hosted Copilot requests. Keep reviewing locally.' },
  { value: 'review', title: 'Review',
    description: 'Request the initial review for new eligible work.' },
  { value: 're-review', title: 'Re-review',
    description: 'Request another review after eligible updates.' },
  { value: 'all', title: 'All',
    description: 'Request both initial reviews and re-reviews.' },
] as const;

export default function ModeSettings(
  { hosted }: { hosted: ReturnType<typeof useHostedSettings> },
) {
  const state = hosted.settings!;

  const modeUnavailable = !state.mode.valid
    && state.mode.value === null && state.mode.raw === '';

  const writable = state.membership && state.variablesAuthority;

  const ready = writable && state.baseReady
    && state.callerSupported && state.auxiliarySupported;

  const changed = hosted.choice !== (state.mode.value ?? 'none') || !state.mode.valid;
  const permitted = hosted.choice === 'none' ? writable : ready;

  return (
    <div className="hosted-mode-panel">
      <div className="hosted-panel-heading">
        <h3>When should Hosted review run?</h3>
        <span
          className={state.mode.valid ? 'hosted-tag' : 'hosted-tag hosted-tag-warning'}
        >
          {state.mode.valid
            ? `Saved: ${state.mode.value ?? 'none'}`
            : modeUnavailable ? 'Saved mode unavailable' : 'Invalid saved mode'}
        </span>
      </div>
      {modeUnavailable && (
        <p className="hosted-warning" role="alert">
          The saved mode could not be read. Grant repository variable access,
          then refresh. No mode has been assumed or changed.
        </p>
      )}
      {!state.mode.valid && !modeUnavailable && (
        <p className="hosted-warning" role="alert">
          The current value
          {' '}
          <code>{state.mode.raw}</code>
          {' '}
          is not supported. Nothing has been changed. Choose a valid mode and save
          explicitly to replace it.
        </p>
      )}
      <fieldset className="hosted-mode-options" disabled={hosted.busy}>
        <legend className="hosted-visually-hidden">Hosted review mode</legend>
        {modes.map((mode) => (
          <label
            key={mode.value}
            className={`hosted-mode-card${hosted.choice === mode.value ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name="hosted-review-mode"
              value={mode.value}
              checked={hosted.choice === mode.value}
              onChange={() => hosted.choose(mode.value)}
            />
            <span>
              <strong>{mode.title}</strong>
              <span>{mode.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {hosted.choice && hosted.choice !== 'none' && (
        <div className="hosted-consent">
          <p>
            <strong>Scheduled work, not an immediate run.</strong>
            {' '}
            Saving allows selected work on your station’s canonical recurring schedule.
            It does not change that schedule or start a run now.
          </p>
          <p>
            <strong>Best-effort execution.</strong>
            {' '}
            Quota, entitlement, authorization, budget or timeout limits can stop requests.
            A configured mode does not guarantee a review. Unprocessed work stays Pending
            without a FAIL judgment; Reviewer Summary continues independently.
          </p>
          <p>
            <strong>Separate authority.</strong>
            {' '}
            Hosted results require separate Reviewer authorization for comments and
            Star / Unstar effects. Station lifecycle authority permits Issue
            close/reopen; Copilot requests use workflow authority.
            These roles cannot replace each other.
            The local CLI remains available as your interactive or fallback path.
          </p>
          <label>
            <input
              type="checkbox"
              checked={hosted.confirmed}
              disabled={hosted.busy}
              onChange={(event) => hosted.setConfirmed(event.target.checked)}
            />
            <span>
              I authorize recurring Hosted review requests for the selected mode.
            </span>
          </label>
        </div>
      )}
      {hosted.choice === 'none' && (
        <p className="hosted-muted">
          None stops new Hosted review requests. It keeps your Reviewer grant, existing
          Pending work, and Reviewer Summary unchanged.
        </p>
      )}
      {!permitted && (
        <p className="hosted-warning">
          {!writable
            ? 'Station membership and repository variable access are required.'
            : 'Update base setup and both workflows to enable Hosted review.'}
          {writable && ' You can still save None without enabling Hosted review.'}
        </p>
      )}
      {state.mode.valid && state.mode.value && state.mode.value !== 'none'
        && state.grant !== 'connected' && (
        <p className="hosted-warning">
          Hosted mode is configured, but Reviewer authority is unavailable. Connect or
          reconnect below; your saved mode is preserved.
        </p>
      )}
      <div className="hosted-save-row">
        <button
          className="button primary"
          disabled={hosted.busy || !changed || !hosted.choice || !permitted
            || (hosted.choice !== 'none' && !hosted.confirmed)}
          onClick={hosted.save}
        >
          Save Hosted mode
        </button>
        <p className="hosted-muted">Selection takes effect only after saving.</p>
      </div>
    </div>
  );
}
