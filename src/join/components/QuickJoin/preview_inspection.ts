import type useQuickJoin from '~app/join/hooks/useQuickJoin';
import { canonicalJoinGuidance } from '~app/join/hooks/useQuickJoin';

type Inspection = NonNullable<ReturnType<typeof useQuickJoin>['inspection']>;
type Session = NonNullable<ReturnType<typeof useQuickJoin>['session']>;
type Stage = Inspection['stages'][number];

export function previewInspection(): Inspection {
  return {
    planId: '',
    identity: { id: 0, login: '' },
    rootHead: '',
    rootOwner: false,
    stages: canonicalJoinGuidance.map((stage) => ({
      id: stage.id,
      label: stage.label,
      state: stage.id === 'identity' ? 'current' : 'waiting',
      detail: stage.description,
    })),
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
