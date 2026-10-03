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
export type InspectionStage
  = 'github_identity' | 'reviewer_node' | 'app_access'
    | 'station_setup' | 'review_policy' | 'ready';
export type JoinFailure = {
  code: string;
  message: string;
  stage?: InspectionStage;
  retryable?: boolean;
  pathClass?: string;
  status?: number | null;
  failure?: string;
  rateLimitClass?: 'primary' | 'secondary' | null;
  rateLimitReset?: string | null;
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
  error?: JoinFailure;
  result?: Inspection;
};

export type Snapshot = {
  planId?: string;
  identity: Identity;
  repository: { id: number; fullName: string; defaultBranch: string } | null;
  rootOwner: boolean;
  rootHead: string;
  nodeHead: string | null;
  waiting: 'fork' | 'app_access' | null;
  appAccess: boolean;
  issuesEnabled: boolean;
  actionsEnabled: boolean;
  managedFilesMatch: boolean;
  workflowActive: boolean;
  workflowSupported: boolean;
  platformBlocked: boolean;
  policy: { content: string; defaultContent: string; matchesDefault: boolean };
  policyComplete: boolean;
  operations: string[];
  ready: boolean;
  installationUrl?: string;
};
