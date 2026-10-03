export { resolveJoinServiceUrl } from './local_service_url';

export type Identity = { id: number; login: string };
export type Session = {
  session: string;
  csrfToken: string;
  identity: Identity;
};
export type Stage = {
  id: string;
  label: string;
  state:
    | 'complete'
    | 'current'
    | 'available'
    | 'blocked'
    | 'waiting'
    | 'executing'
    | 'failed';
  detail: string;
  facts?: { label: string; state: Stage['state']; detail: string }[];
  action?: 'fork' | 'app_access' | 'policy' | 'execute';
};
export type Inspection = {
  planId: string;
  identity: Identity;
  node?: { id: number; fullName: string; url: string; head: string };
  rootOwner: boolean;
  rootHead: string;
  stages: Stage[];
  operations: { id: string; label: string }[];
  ready: boolean;
  forkUrl?: string;
  installationUrl?: string;
  policy?: { current: string; default: string; isDefault: boolean };
  blockedReason?: string;
};
export type PolicyPlan = {
  planId: string;
  content: string;
  changes: boolean;
  head: string;
};
export type Job = {
  status: 'queued' | 'running' | 'failed' | 'blocked' | 'complete';
  progress: {
    completed: number;
    total: number;
    currentOperation?: string;
    verifiedOperations: string[];
    operations?: {
      name: string;
      state: 'queued' | 'executing' | 'verified' | 'failed' | 'blocked';
      error?: string;
    }[];
  };
  error?: { code: string; message: string };
  result?: Inspection;
};

type Snapshot = {
  planId: string;
  identity: Identity;
  repository: { id: number; fullName: string; defaultBranch: string } | null;
  rootOwner: boolean;
  rootHead: string;
  nodeHead: string;
  waiting: 'fork' | 'app_access' | null;
  appAccess: boolean;
  issuesEnabled: boolean;
  actionsEnabled: boolean;
  managedFilesMatch: boolean;
  workflowActive: boolean;
  workflowSupported: boolean;
  platformBlocked: boolean;
  policy: { content: string; defaultContent: string; matchesDefault: boolean };
  operations: string[];
  ready: boolean;
  installationUrl?: string;
};

type ServerJob = Omit<Job, 'result'> & {
  id?: string;
  result?: { inspection: Snapshot };
};

const operationLabels: Record<string, string> = {
  enable_issues: 'Enable Issues',
  enable_actions: 'Enable repository Actions',
  sync_managed_files:
    'Synchronize canonical Review Request form and Summary Workflow',
  enable_workflow: 'Activate canonical Reviewer Summary Workflow',
  write_policy: 'Commit the explicitly confirmed README.md Policy',
};

function inspectionView(snapshot: Snapshot): Inspection {
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

  const stationComplete = stationFacts.every((item) => item.state === 'complete');
  const stationActionable = snapshot.appAccess && snapshot.operations.length > 0;
  const policyAvailable = stationComplete && !!snapshot.policy?.content;

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
        state: policyAvailable ? 'available' : 'waiting',
        detail: !stationComplete
          ? 'Available after Station setup is verified.'
          : snapshot.policy?.matchesDefault
            ? 'Current Policy equals the default; adoption needs no commit.'
            : 'Your existing README.md is preserved unless separately confirmed.',
        action: policyAvailable ? 'policy' : undefined,
      },
      {
        id: 'ready',
        label: 'Station ready / publication waiting',
        state: snapshot.ready && policyAvailable ? 'complete' : 'waiting',
        detail: snapshot.ready
          ? 'Station readiness is verified. Directory publication waits for '
          + 'a later Network Scan.'
          : 'Readiness appears after required station facts are verified.',
      },
    );
  }

  return {
    planId: snapshot.planId,
    identity: snapshot.identity,
    rootOwner: snapshot.rootOwner,
    ...(snapshot.repository
      ? {
          node: {
            ...snapshot.repository,
            url: `https://github.com/${snapshot.repository.fullName}`,
            head: snapshot.nodeHead,
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

export class JoinError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

function publicJob(value: ServerJob): Job & { id?: string } {
  return {
    id: value.id,
    status: value.status,
    progress: value.progress,
    error: value.error,
    result: value.result ? inspectionView(value.result.inspection) : undefined,
  };
}

function opaqueId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function joinClient(serviceUrl: string) {
  const base = new URL(serviceUrl);

  if (
    base.protocol !== 'https:'
    && base.hostname !== 'localhost'
    && base.hostname !== '127.0.0.1'
  ) {
    throw new Error('Quick Web Join requires a secure service URL.');
  }

  const request = async <T>(
    path: string,
    session?: Session,
    body?: unknown,
  ): Promise<T> => {
    const response = await fetch(new URL(path, base), {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(session
          ? {
              Authorization: `Session ${session.session}`,
              'X-CSRF-Token': session.csrfToken,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const value = await response.json();

    if (!response.ok) {
      throw new JoinError(
        value.error?.message
        ?? 'The Join service could not complete this request.',
        value.error?.code ?? 'request_failed',
      );
    }

    return value as T;
  };

  return {
    origin: base.origin,
    get authUrl() {
      const url = new URL('/auth/start', base);

      url.searchParams.set('flow', opaqueId());

      return url.href;
    },
    session: (code: string) =>
      request<Session>('/api/session', undefined, { code }),
    restore: () =>
      request<Session>('/api/session/current'),
    inspect: async (session: Session) =>
      inspectionView(await request<Snapshot>('/api/inspect', session, {})),
    execute: (session: Session, planId: string) =>
      request<{ jobId: string }>('/api/execute', session, { planId }),
    status: async (session: Session, jobId: string): Promise<Job> =>
      publicJob(
        await request<ServerJob>(
          `/api/status?jobId=${encodeURIComponent(jobId)}`,
          session,
        ),
      ),
    currentStatus: async (session: Session): Promise<Job & { id?: string }> =>
      publicJob(await request<ServerJob>('/api/status/current', session)),
    policy: async (
      session: Session,
      planId: string,
      choice: 'keep' | 'default' | 'custom',
      content?: string,
    ): Promise<PolicyPlan> => {
      const value = await request<{
        planId: string;
        content: string;
        noop: boolean;
        nodeHead: string;
      }>('/api/policy/plan', session, {
        planId,
        choice,
        ...(content === undefined ? {} : { content }),
      });

      return {
        planId: value.planId,
        content: value.content,
        changes: !value.noop,
        head: value.nodeHead,
      };
    },
    confirmPolicy: (session: Session, planId: string) =>
      request<{ jobId: string }>('/api/policy/confirm', session, { planId }),
    logout: (session: Session) => request<void>('/api/logout', session, {}),
  };
}
