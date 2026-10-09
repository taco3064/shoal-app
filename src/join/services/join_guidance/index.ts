export type JoinStageGuidance = {
  id: string;
  label: string;
  description: string;
  localDescription: string;
  commands?: readonly string[];
};

export const canonicalJoinGuidance: readonly JoinStageGuidance[] = [
  {
    id: 'identity',
    label: 'GitHub identity',
    description: 'GitHub sign-in enables Web-assisted inspection and explicitly '
      + 'confirmed setup. Public reading requires no authentication and grants '
      + 'no repository mutation authority.',
    localDescription: 'Website authorization is optional. You can complete the '
      + 'same canonical stages from your own checkout using your personal '
      + 'GitHub identity.',
  },
  {
    id: 'node',
    label: 'Reviewer Node / direct fork',
    description: 'Your Reviewer Node is a Personal Account direct fork of the '
      + 'canonical Network Root, taco3064/shoal-station. A fork of another '
      + 'Reviewer Node does not qualify. The Network Root owner already owns '
      + 'a Reviewer Node and does not need Quick Web Join.',
    localDescription: 'Directly fork taco3064/shoal-station with your personal '
      + 'GitHub account, then clone your own fork. A fork of another Reviewer '
      + 'Node does not qualify.',
  },
  {
    id: 'access',
    label: 'GitHub App repository access',
    description: 'Web-assisted setup needs GitHub App access to your Reviewer '
      + 'Node. Authorize the intended repository before confirming bounded '
      + 'setup changes. Browsing public information does not authorize writes.',
    localDescription: 'Granting Website mutation authority is only for '
      + 'Web-assisted setup. Local setup can continue from your checkout with '
      + 'authenticated GitHub CLI access.',
  },
  {
    id: 'station',
    label: 'Station setup',
    description: 'Shoal inspects Issues, repository Actions, managed station '
      + 'files, Summary Workflow activation, and the supported exact generation. '
      + 'Web-assisted setup confirms and verifies only remaining authorized '
      + 'non-Policy operations; Local / CLI converges the same station facts.',
    localDescription: 'Confirm GitHub Actions in your fork, authenticate the '
      + 'GitHub CLI, and run the Shoal initializer from a clean checkout of '
      + 'your fork. gh shoal init remains available for station setup, repair, '
      + 'and migration.',
    commands: [
      'gh auth status',
      'gh extension install taco3064/gh-shoal',
      'gh shoal init',
    ],
  },
  {
    id: 'policy',
    label: 'Review Policy',
    description: 'You own README.md as your Review Policy. Explicitly adopt the '
      + 'inherited Policy unchanged, or customize and confirm it. Automatic '
      + 'station setup does not silently rewrite your standards.',
    localDescription: 'Adopt the inherited README.md unchanged, or edit, '
      + 'commit, and push your own README.md Review Policy. Setup must leave '
      + 'that standard to you.',
  },
  {
    id: 'ready',
    label: 'Station ready / publication waiting',
    description: 'Station readiness is verified from authoritative GitHub '
      + 'state. Directory visibility waits for a separate successful Network '
      + 'Scan and publication; readiness does not guarantee a publication '
      + 'deadline. Optional Hosted Review availability is separate from '
      + 'Station Readiness.',
    localDescription: 'Readiness and Directory publication use the same '
      + 'station facts whether work was completed through the Website or '
      + 'gh shoal. Wait for a successful Network Scan and publication after '
      + 'station readiness; publication has no guaranteed deadline.',
  },
];

export function findJoinGuidance(stageId: string) {
  return canonicalJoinGuidance.find((stage) => stage.id === stageId);
}
