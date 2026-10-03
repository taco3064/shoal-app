import type { Inspection, Snapshot, Stage } from './types';

const operationLabels: Record<string, string> = {
  enable_issues: 'Enable Issues',
  enable_actions: 'Enable repository Actions',
  sync_managed_files:
    'Synchronize canonical Review Request form and Summary Workflow',
  enable_workflow: 'Activate canonical Reviewer Summary Workflow',
  write_policy: 'Commit the explicitly confirmed README.md Policy',
};

export function inspectionView(snapshot: Snapshot): Inspection {
  const fact = (
    label: string,
    complete: boolean,
    detail: string,
    blocked = false,
  ): NonNullable<Stage['facts']>[number] => ({
    label,
    state: blocked ? 'blocked' : complete ? 'complete' : 'current',
    detail,
  });

  const stationFacts = [
    fact(
      'Issues availability',
      snapshot.issuesEnabled,
      'Canonical Review Requests use repository Issues.',
    ),
    fact(
      'Repository Actions',
      snapshot.actionsEnabled,
      'Existing unrelated Actions policy settings are preserved.',
    ),
    fact(
      'Canonical managed station files',
      snapshot.managedFilesMatch,
      'Review Request form and Summary Workflow match one exact Network Root generation.',
    ),
    fact(
      'Summary Workflow activation',
      snapshot.workflowActive,
      'The governed Summary Workflow is active.',
    ),
    fact(
      'Platform-supported exact generation',
      snapshot.workflowSupported,
      'Exact Workflow digest support uses the same authority as Network Projection.',
      snapshot.platformBlocked,
    ),
  ];

  if (!snapshot.appAccess || snapshot.waiting) {
    for (const item of stationFacts) {
      item.state = 'waiting';
    }
  }

  const stationComplete = stationFacts.every((item) => item.state === 'complete');
  const stationActionable = snapshot.appAccess && snapshot.operations.length > 0;
  const policyAvailable = stationComplete && !!snapshot.policy?.content;
  const policyComplete = policyAvailable && snapshot.policyComplete;

  const policyDetail = policyComplete
    ? 'Review Policy choice is confirmed for this station state.'
    : snapshot.policy?.matchesDefault
      ? 'Current Policy equals the default; adoption needs no commit.'
      : 'Your existing README.md is preserved unless separately confirmed.';

  const readyDetail = snapshot.ready && policyComplete
    ? 'Station readiness is verified. Directory publication waits for '
    + 'a later Network Scan.'
    : snapshot.ready
      ? 'Station readiness is verified. Confirm the Policy step before '
      + 'the canonical Join journey is complete.'
      : 'Readiness appears after required station facts are verified.';

  const stages: Stage[] = [
    {
      id: 'identity',
      label: 'GitHub identity',
      state: 'complete',
      detail: snapshot.identity.login,
    },
  ];

  if (snapshot.rootOwner) {
    stages.push({
      id: 'root-owner',
      label: 'Network Root owner',
      state: 'complete',
      detail:
        'The Network Root is already your Reviewer Node, '
        + 'so Quick Web Join is not required for this account.',
    });
  } else {
    stages.push(
      {
        id: 'node',
        label: 'Reviewer Node / direct fork',
        state: snapshot.repository ? 'complete' : 'current',
        detail: snapshot.repository?.fullName
          ?? 'Create a direct fork of the Network Root using your personal account.',
        action: snapshot.repository ? undefined : 'fork',
      },
      {
        id: 'access',
        label: 'GitHub App repository access',
        state: snapshot.appAccess
          ? 'complete'
          : snapshot.repository ? 'current' : 'waiting',
        detail: snapshot.repository
          ? 'Select only your Reviewer Node when granting repository access.'
          : 'Available after your direct fork exists.',
        action:
          snapshot.repository && !snapshot.appAccess
            ? 'app_access'
            : undefined,
      },
      {
        id: 'station',
        label: 'Station setup',
        state: stationComplete
          ? 'complete'
          : stationActionable ? 'current' : snapshot.appAccess ? 'blocked' : 'waiting',
        detail: stationComplete
          ? 'Issues, Actions, managed files, Workflow and platform support are verified.'
          : stationActionable
            ? 'Shoal can complete the remaining station setup after your confirmation.'
            : snapshot.appAccess
              ? 'Station setup needs attention before the Policy step can open.'
              : 'Available after the GitHub App can inspect your Reviewer Node.',
        facts: stationFacts,
        action:
          stationActionable
            ? 'execute'
            : undefined,
      },
      {
        id: 'policy',
        label: 'Review Policy',
        state: policyComplete
          ? 'complete'
          : policyAvailable ? 'available' : 'waiting',
        detail: !stationComplete
          ? 'Available after Station setup is verified.'
          : policyDetail,
        action: policyAvailable && !policyComplete ? 'policy' : undefined,
      },
      {
        id: 'ready',
        label: 'Station ready / publication waiting',
        state: snapshot.ready && policyComplete ? 'complete' : 'waiting',
        detail: readyDetail,
      },
    );
  }

  return {
    planId: snapshot.planId ?? '',
    identity: snapshot.identity,
    rootOwner: snapshot.rootOwner,
    ...(snapshot.repository
      ? {
          node: {
            ...snapshot.repository,
            url: `https://github.com/${snapshot.repository.fullName}`,
            head: snapshot.nodeHead ?? '',
          },
        }
      : {}),
    rootHead: snapshot.rootHead,
    stages,
    operations: snapshot.operations.map((id) => ({
      id,
      label: operationLabels[id] ?? id.replaceAll('_', ' '),
    })),
    ready: snapshot.ready,
    ...(snapshot.waiting === 'fork'
      ? { forkUrl: 'https://github.com/taco3064/shoal-station/fork' }
      : {}),
    ...(snapshot.installationUrl
      ? { installationUrl: snapshot.installationUrl }
      : {}),
    ...(snapshot.policy
      ? {
          policy: {
            current: snapshot.policy.content,
            default: snapshot.policy.defaultContent,
            isDefault: snapshot.policy.matchesDefault,
          },
        }
      : {}),
    ...(snapshot.platformBlocked
      ? {
          blockedReason:
            'Root Workflow awaits Platform support. Refresh after admission.',
        }
      : {}),
  };
}
