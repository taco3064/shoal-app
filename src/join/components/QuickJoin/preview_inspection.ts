import type useQuickJoin from '~app/join/hooks/useQuickJoin';

type Inspection = NonNullable<ReturnType<typeof useQuickJoin>['inspection']>;

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
        detail: 'Shoal checks for your direct Personal Account fork after sign-in.',
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
        detail: 'Shoal shows remaining setup only after inspecting GitHub state.',
      },
      {
        id: 'policy',
        label: 'Review Policy',
        state: 'waiting',
        detail: 'Policy authorship remains yours and is confirmed separately.',
      },
      {
        id: 'ready',
        label: 'Station ready / publication waiting',
        state: 'waiting',
        detail: 'Readiness and Directory publication appear after verification.',
      },
    ],
    operations: [],
    ready: false,
  };
}
