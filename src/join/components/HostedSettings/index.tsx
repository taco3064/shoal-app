import useHostedSettings from '~app/join/hooks/useHostedSettings';
import ModeSettings from './ModeSettings';
import CopilotAuthority from './CopilotAuthority';
import Readiness from './Readiness';
import './styles.css';

export default function HostedSettings(
  { serviceUrl, session }: {
    serviceUrl: string;
    session?: Parameters<typeof useHostedSettings>[1];
  },
) {
  const hosted = useHostedSettings(serviceUrl, session);

  if (!session) {
    return null;
  }

  return (
    <section
      className="hosted-settings"
      aria-labelledby="hosted-settings-title"
      aria-busy={hosted.busy}
    >
      <header className="hosted-heading">
        <div>
          <p className="section-kicker">OPTIONAL AUTOMATION · AFTER SETUP</p>
          <h2 id="hosted-settings-title">Hosted review settings</h2>
          <p>
            Choose when your station requests a Copilot review. Your setup journey
            and Reviewer Summary stay independent.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={hosted.busy || !hosted.configured}
          onClick={() => void hosted.refresh()}
        >
          Refresh status
        </button>
      </header>
      {hosted.busy && (
        <p role="status" className="hosted-feedback">Checking current GitHub state…</p>
      )}
      {hosted.error && (
        <p role="alert" className="hosted-feedback hosted-warning">{hosted.error}</p>
      )}
      {hosted.notice && <p role="status" className="hosted-feedback">{hosted.notice}</p>}
      {!hosted.configured && (
        <p>
          The Hosted settings service is unavailable on this deployment. Local / CLI
          setup remains available.
        </p>
      )}
      {hosted.settings && (
        <>
          <div className="hosted-identity">
            <span>
              {hosted.settings.rootOwner ? 'Root station owner' : 'Reviewer station'}
            </span>
            <strong>
              {hosted.settings.repository?.fullName ?? 'No eligible station found'}
            </strong>
          </div>
          {!hosted.settings.repository && (
            <p>
              Complete the station setup above, then refresh. Hosted settings never
              create a station automatically.
            </p>
          )}
          {hosted.settings.repository && (
            <>
              <ModeSettings hosted={hosted} />
              <div className="hosted-support-grid">
                <CopilotAuthority hosted={hosted} />
                <Readiness hosted={hosted} />
              </div>
              <details className="hosted-details">
                <summary>How authority and local fallback work</summary>
                <p>
                  GitHub App installation authority changes station files and
                  variables. The station workflow token authorizes Copilot requests.
                  Your separate Reviewer OAuth grant uses GitHub public_repo scope
                  for permitted Reviewer comments and Star / Unstar effects. Its
                  GitHub scope is broader than this station. Neither authority
                  substitutes for the other.
                </p>
                <p>
                  The long-lived refresh credential stays encrypted on the broker.
                  A short-lived Reviewer access credential is returned to an admitted
                  station run. Local / CLI execution uses your own credentials and
                  stays available as an explicit alternative. Reviewer authorization
                  does not prove Copilot entitlement.
                </p>
                <p>
                  Operational failures do not produce FAIL judgments. Pending work
                  remains pending. Reviewer Summary runs independently of this mode.
                </p>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
