type StageWithId = {
  id: string;
};

export default function LocalStageGuidance({ stage }: { stage: StageWithId }) {
  if (stage.id === 'identity') {
    return (
      <div className="quick-local-note">
        <strong>Local / CLI mode:</strong>
        {' '}
        Website authorization is optional. You can complete the same canonical
        stages from your own checkout.
      </div>
    );
  }

  if (stage.id === 'node') {
    return (
      <div className="quick-local-note">
        <strong>Local / CLI mode:</strong>
        {' '}
        Directly fork
        {' '}
        <code>taco3064/shoal-station</code>
        {' '}
        with your personal GitHub account. A fork of another Reviewer Node does
        not qualify.
      </div>
    );
  }

  if (stage.id === 'access') {
    return (
      <div className="quick-local-note">
        <strong>Local / CLI mode:</strong>
        {' '}
        Granting Website mutation authority is only for Web-assisted setup.
        Local setup can continue from your checkout with authenticated GitHub
        CLI access.
      </div>
    );
  }

  if (stage.id === 'station') {
    return (
      <div className="quick-local-note">
        <strong>Local / CLI mode:</strong>
        {' '}
        Confirm GitHub Actions in your fork, install
        {' '}
        <code>gh</code>
        , run
        {' '}
        <code>gh auth status</code>
        , install
        {' '}
        <code>gh extension install taco3064/gh-shoal</code>
        , then run
        {' '}
        <code>gh shoal init</code>
        {' '}
        in a clean checkout.
      </div>
    );
  }

  if (stage.id === 'policy') {
    return (
      <div className="quick-local-note">
        <strong>Local / CLI mode:</strong>
        {' '}
        Edit, commit, and push your own
        {' '}
        <code>README.md</code>
        {' '}
        Review Policy. Setup must leave that standard to you.
      </div>
    );
  }

  if (stage.id === 'ready') {
    return (
      <div className="quick-local-note">
        <strong>Local / CLI mode:</strong>
        {' '}
        Readiness and Directory publication use the same station facts whether
        the work was completed through the Website or through
        {' '}
        <code>gh shoal</code>
        .
      </div>
    );
  }

  return null;
}
