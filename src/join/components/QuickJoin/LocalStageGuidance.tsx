type StageWithId = {
  id: string;
};

export default function LocalStageGuidance({
  open = false,
  stage,
  webDetail,
}: {
  open?: boolean;
  stage: StageWithId;
  webDetail?: string;
}) {
  const guidance = localGuidance(stage.id);

  if (!guidance) {
    return null;
  }

  return (
    <details className="quick-local-note" open={open}>
      <summary>
        {webDetail
          ? 'Web / Local guidance for this stage'
          : 'Local / CLI mode for this stage'}
      </summary>
      {webDetail && (
        <>
          <h5>Web-assisted setup</h5>
          <p>{webDetail}</p>
          <h5>Local / CLI setup</h5>
        </>
      )}
      {guidance}
    </details>
  );
}

function localGuidance(stageId: string) {
  if (stageId === 'identity') {
    return (
      <p>
        Website authorization is optional. You can complete the same canonical
        stages from your own checkout.
      </p>
    );
  }

  if (stageId === 'node') {
    return (
      <p>
        Directly fork
        {' '}
        <code>taco3064/shoal-station</code>
        {' '}
        with your personal GitHub account. A fork of another Reviewer Node does
        not qualify.
      </p>
    );
  }

  if (stageId === 'access') {
    return (
      <p>
        Granting Website mutation authority is only for Web-assisted setup.
        Local setup can continue from your checkout with authenticated GitHub
        CLI access.
      </p>
    );
  }

  if (stageId === 'station') {
    return (
      <>
        <p>
          Confirm GitHub Actions in your fork, authenticate the GitHub CLI, and
          run the Shoal initializer from a clean checkout.
        </p>
        <ol>
          <li>
            <code>gh auth status</code>
          </li>
          <li>
            <code>gh extension install taco3064/gh-shoal</code>
          </li>
          <li>
            <code>gh shoal init</code>
          </li>
        </ol>
      </>
    );
  }

  if (stageId === 'policy') {
    return (
      <p>
        Edit, commit, and push your own
        {' '}
        <code>README.md</code>
        {' '}
        Review Policy. Setup must leave that standard to you.
      </p>
    );
  }

  if (stageId === 'ready') {
    return (
      <p>
        Readiness and Directory publication use the same station facts whether
        the work was completed through the Website or through
        {' '}
        <code>gh shoal</code>
        . Directory visibility waits for a separate successful Network Scan and
        publication. Completing local setup does not guarantee a publication
        deadline.
      </p>
    );
  }

  return null;
}
