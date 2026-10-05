import type useHostedSettings from '~app/join/hooks/useHostedSettings';

export default function Readiness(
  { hosted }: { hosted: ReturnType<typeof useHostedSettings> },
) {
  const state = hosted.settings!;

  const facts = [
    ['Base station', state.baseReady ? 'Ready' : 'Setup needed'],
    ['Hosted caller', state.callerSupported ? 'Supported' : 'Update needed'],
    ['Auxiliary workflow', state.auxiliarySupported ? 'Supported' : 'Update needed'],
    ['Repository variables',
      state.variablesAuthority ? 'Access granted' : 'Permission needed'],
    ['Hosted connection', state.bootstrap === 'current'
      ? 'Configured'
      : state.bootstrap === 'repair_required'
        ? 'Restore needed'
        : 'Unavailable'],
  ];

  return (
    <section
      className="hosted-support-panel"
      aria-labelledby="hosted-readiness-title"
    >
      <p className="section-kicker">STATION READINESS</p>
      <h3 id="hosted-readiness-title">Setup & recovery</h3>
      <dl className="hosted-facts">
        {facts.map(([label, detail]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
      {!state.variablesAuthority && (
        <a
          className="hosted-text-link"
          href={state.installationUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Upgrade GitHub App permissions ↗
        </a>
      )}
      {state.bootstrap !== 'current' && (
        <>
          <p>
            Restore the Hosted broker connection explicitly. Your saved mode and
            Reviewer authority stay unchanged.
          </p>
          <button
            className="button secondary"
            disabled={hosted.busy || !state.membership || !state.variablesAuthority
              || !state.baseReady || !state.callerSupported
              || !state.auxiliarySupported}
            onClick={hosted.repair}
          >
            Restore Hosted connection
          </button>
        </>
      )}
    </section>
  );
}
