import type {
  ActionsPolicy,
  GitFile,
  GitHubUser,
  NodeBinding,
  Repository,
  Workflow,
} from '../github_join';

export type OperationName
  = 'enable_issues' | 'enable_actions' | 'sync_managed_files' | 'enable_workflow';
export type OperationStatus = {
  name: OperationName | 'write_policy';
  state: 'queued' | 'executing' | 'verified' | 'failed' | 'blocked';
  error?: string;
};
export type Inspection = {
  identity: GitHubUser;
  repository: Repository | null;
  rootOwner: boolean;
  binding: NodeBinding | null;
  root: Repository;
  rootHead: string;
  nodeHead: string | null;
  rootFiles: {
    form: GitFile | null;
    workflow: GitFile | null;
    policy: GitFile | null;
  } | null;
  files: {
    form: GitFile | null;
    workflow: GitFile | null;
    policy: GitFile | null;
  };
  actions: ActionsPolicy | null;
  workflowRegistryAvailable: boolean;
  workflow: Workflow | null;
  operations: OperationName[];
  waiting: 'fork' | 'app_access' | null;
  platformBlocked: boolean;
  ready: boolean;
};
export type PublicInspection = {
  identity: { id: number; login: string };
  repository: { id: number; fullName: string; defaultBranch: string } | null;
  rootOwner: boolean;
  rootHead: string;
  nodeHead: string | null;
  waiting: Inspection['waiting'];
  appAccess: boolean;
  issuesEnabled: boolean;
  actionsEnabled: boolean;
  actionsPolicyEnabled: boolean;
  workflowRegistryAvailable: boolean;
  workflowIdentityAvailable: boolean;
  managedFilesMatch: boolean;
  workflowActive: boolean;
  workflowSupported: boolean;
  platformBlocked: boolean;
  policy: { content: string; defaultContent: string; matchesDefault: boolean };
  policyComplete: boolean;
  operations: OperationName[];
  ready: boolean;
  publication: 'waiting_for_projection';
};
export type ExecutionResult = {
  inspection: Inspection;
  operations: OperationStatus[];
  completed: number;
  total: number;
  ready: boolean;
};
export type PolicyChoice = {
  kind: 'default' | 'custom' | 'keep';
  content?: string;
};
export type PolicyPlan = {
  inspection: Inspection;
  content: string;
  expectedBlob: string | null;
  noop: boolean;
};
export type ProgressObserver = (
  result: Omit<ExecutionResult, 'inspection'>,
) => void | Promise<void>;

export type ExecutionCheckpoint = {
  plan: Inspection;
  inspection: Inspection;
  operations: OperationStatus[];
};
export type ExecutionStep = {
  done: boolean;
  result: ExecutionResult;
  checkpoint: ExecutionCheckpoint;
};
