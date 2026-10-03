import { inspectionView } from './inspection_view';
import type { Inspection, InspectionStage, JoinFailure, Snapshot } from './types';

const stageIds = {
  github_identity: 'identity',
  reviewer_node: 'node',
  app_access: 'access',
  station_setup: 'station',
  review_policy: 'policy',
  ready: 'ready',
} as const;

const unverifiedSnapshot: Snapshot = {
  planId: '',
  identity: { id: 0, login: '' },
  repository: null,
  rootOwner: false,
  rootHead: '',
  nodeHead: '',
  waiting: null,
  appAccess: false,
  issuesEnabled: false,
  actionsEnabled: false,
  managedFilesMatch: false,
  workflowActive: false,
  workflowSupported: false,
  platformBlocked: false,
  policy: { content: '', defaultContent: '', matchesDefault: false },
  policyComplete: false,
  operations: [],
  ready: false,
};

export class JoinError extends Error {
  readonly stage?: InspectionStage;
  readonly retryable?: boolean;
  readonly pathClass?: string;
  readonly status?: number | null;
  readonly failure?: string;
  readonly rateLimitClass?: 'primary' | 'secondary' | null;
  rateLimitReset?: string | null;
  readonly inspection?: Inspection;

  constructor(
    message: string,
    public readonly code: string,
    details?: Omit<JoinFailure, 'code' | 'message'>,
    snapshot?: Snapshot,
  ) {
    super(message);

    this.stage = details?.stage && Object.hasOwn(stageIds, details.stage)
      ? details.stage
      : undefined;

    this.retryable = details?.retryable;
    this.pathClass = details?.pathClass;
    this.status = details?.status;
    this.failure = details?.failure;
    this.rateLimitClass = details?.rateLimitClass;
    this.rateLimitReset = details?.rateLimitReset;

    if (this.stage) {
      this.inspection = failedInspection(message, this.stage, snapshot);
    }
  }
}

function failedInspection(
  message: string,
  stage: InspectionStage,
  snapshot?: Snapshot,
): Inspection {
  const inspection = inspectionView({
    ...(snapshot ?? unverifiedSnapshot),
    planId: '',
    operations: [],
    ready: false,
  });

  const failedIndex = inspection.stages.findIndex(
    (item) => item.id === stageIds[stage],
  );

  return {
    ...inspection,
    forkUrl: undefined,
    installationUrl: undefined,
    blockedReason: undefined,
    policy: undefined,
    stages: inspection.stages.map((item, index) => ({
      ...item,
      state: index === failedIndex
        ? 'failed'
        : snapshot && index < failedIndex && item.state === 'complete'
          ? 'complete'
          : 'waiting',
      detail: index === failedIndex
        ? message
        : snapshot && index < failedIndex && item.state === 'complete'
          ? item.detail
          : 'Waiting for a fresh authoritative inspection.',
      facts: undefined,
      action: undefined,
    })),
  };
}
