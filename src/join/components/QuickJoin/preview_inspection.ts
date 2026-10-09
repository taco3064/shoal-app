import type useQuickJoin from '~app/join/hooks/useQuickJoin';

type Inspection = NonNullable<ReturnType<typeof useQuickJoin>['inspection']>;
type Session = NonNullable<ReturnType<typeof useQuickJoin>['session']>;
type Stage = Inspection['stages'][number];

export function previewInspection(): Inspection {
  return {
    planId: '',
    identity: { id: 0, login: '' },
    rootHead: '',
    rootOwner: false,
    stages: [
      {
        id: 'identity',
        label: 'GitHub identity',
        state: 'current',
        detail: 'Sign in with GitHub to begin the authoritative join journey.',
      },
      {
        id: 'node',
        label: 'Reviewer Node / direct fork',
        state: 'waiting',
        detail: 'Use your Personal Account to directly fork the canonical Network Root. '
          + 'After sign-in, Shoal checks whether that Reviewer Node already exists.',
      },
      {
        id: 'access',
        label: 'GitHub App repository access',
        state: 'waiting',
        detail: 'If needed, you grant the App access only to your Reviewer Node.',
      },
      {
        id: 'station',
        label: 'Station setup',
        state: 'waiting',
        detail: 'Shoal verifies Issues, Actions, managed files, the Summary Workflow, '
          + 'and a supported station generation. You confirm only the remaining '
          + 'non-Policy setup after authoritative inspection.',
      },
      {
        id: 'policy',
        label: 'Review Policy',
        state: 'waiting',
        detail: 'Explicitly adopt the inherited README.md Policy or customize it. '
          + 'Your Policy is confirmed separately from automatic station setup.',
      },
      {
        id: 'ready',
        label: 'Station ready / publication waiting',
        state: 'waiting',
        detail: 'Verified station readiness does not immediately publish your Directory '
          + 'entry. Publication waits for a separate successful Network Scan and '
          + 'publication; no fixed deadline is guaranteed.',
      },
    ],
    operations: [],
    ready: false,
  };
}

export function authenticatedPlaceholderInspection(
  session: Session,
  mode: 'verifying' | 'failed' | 'executing',
): Inspection {
  const downstreamState: Stage['state'] = 'waiting';

  const nodeDetail = mode === 'failed'
    ? 'Shoal could not verify current GitHub repository state. Refresh to retry.'
    : 'Shoal is checking your current Reviewer Node state from GitHub.';

  return {
    planId: '',
    identity: session.identity,
    rootHead: '',
    rootOwner: false,
    stages: [
      {
        id: 'identity',
        label: 'GitHub identity',
        state: 'complete',
        detail: `Signed in as ${session.identity.login}.`,
      },
      {
        id: 'node',
        label: 'Reviewer Node / direct fork',
        state: mode === 'executing' ? 'waiting' : downstreamState,
        detail: nodeDetail,
      },
      {
        id: 'access',
        label: 'GitHub App repository access',
        state: 'waiting',
        detail: 'Waiting for the latest authoritative inspection.',
      },
      {
        id: 'station',
        label: 'Station setup',
        state: mode === 'executing' ? 'executing' : 'waiting',
        detail: mode === 'executing'
          ? 'Shoal is recovering the active server-side execution.'
          : 'Station setup remains locked until inspection succeeds.',
      },
      {
        id: 'policy',
        label: 'Review Policy',
        state: 'waiting',
        detail: 'Policy state remains unverified until inspection succeeds.',
      },
      {
        id: 'ready',
        label: 'Station ready / publication waiting',
        state: 'waiting',
        detail: 'Readiness is shown only after verified inspection.',
      },
    ],
    operations: [],
    ready: false,
  };
}
