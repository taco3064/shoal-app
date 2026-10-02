export type Identity = { id: number; login: string };
export type Session = {
  session: string;
  csrfToken: string;
  identity: Identity;
};
export type Stage = {
  id: string;
  label: string;
  state: 'complete' | 'incomplete' | 'blocked' | 'waiting';
  detail: string;
};
export type Inspection = {
  planId: string;
  identity: Identity;
  node?: { id: number; fullName: string; url: string; head: string };
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
    id: string,
    label: string,
    complete: boolean,
    detail: string,
  ): Stage => ({
    id,
    label,
    state: complete ? 'complete' : snapshot.waiting ? 'waiting' : 'incomplete',
    detail,
  });

  const stages = [
    fact('identity', 'GitHub identity', true, snapshot.identity.login),
    fact(
      'node',
      'Personal Account direct fork',
      Boolean(snapshot.repository),
      snapshot.repository?.fullName
      ?? 'Create a direct fork of the Network Root using your personal account.',
    ),
    fact(
      'access',
      'GitHub App access',
      snapshot.appAccess,
      'Select only your Reviewer Node when granting repository access.',
    ),
    fact(
      'issues',
      'Issues availability',
      snapshot.issuesEnabled,
      'Canonical Review Requests use repository Issues.',
    ),
    fact(
      'actions',
      'Repository Actions',
      snapshot.actionsEnabled,
      'Existing unrelated Actions policy settings are preserved.',
    ),
    fact(
      'managed',
      'Canonical managed station files',
      snapshot.managedFilesMatch,
      'Review Request form and Summary Workflow match one exact Network Root generation.',
    ),
    fact(
      'workflow-active',
      'Summary Workflow activation',
      snapshot.workflowActive,
      'The governed Summary Workflow is active.',
    ),
    fact(
      'workflow-supported',
      'Platform Workflow support',
      snapshot.workflowSupported,
      'Exact Workflow digest support uses the same authority as Network Projection.',
    ),
    fact(
      'policy',
      'Review Policy',
      Boolean(snapshot.policy?.content),
      snapshot.policy?.matchesDefault
        ? 'Current Policy equals the default; adoption needs no commit.'
        : 'Your existing README.md is preserved unless separately confirmed.',
    ),
    fact(
      'ready',
      'Station readiness',
      snapshot.ready,
      snapshot.ready
        ? 'Issues and admitted digests verified; Workflow executability is separate.'
        : 'Required facts are not yet all verified.',
    ),
  ];

  if (snapshot.platformBlocked) {
    stages.push({
      id: 'platform',
      label: 'Canonical generation support',
      state: 'blocked',
      detail:
        'Waiting for Platform admission; an already-supported station is preserved.',
    });
  }

  return {
    planId: snapshot.planId,
    identity: snapshot.identity,
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
      credentials: 'omit',
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
    authUrl: new URL('/auth/start', base).href,
    session: (code: string) =>
      request<Session>('/api/session', undefined, { code }),
    inspect: async (session: Session) =>
      inspectionView(await request<Snapshot>('/api/inspect', session, {})),
    execute: (session: Session, planId: string) =>
      request<{ jobId: string }>('/api/execute', session, { planId }),
    status: async (session: Session, jobId: string): Promise<Job> => {
      const value = await request<
        Omit<Job, 'result'> & { result?: { inspection: Snapshot } }
      >(`/api/status?jobId=${encodeURIComponent(jobId)}`, session);

      return {
        status: value.status,
        progress: value.progress,
        error: value.error,
        result: value.result ? inspectionView(value.result.inspection) : undefined,
      };
    },
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
