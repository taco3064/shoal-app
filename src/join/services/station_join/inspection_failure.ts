import { githubFailure } from '../github_join';
import type { PublicInspection } from './types';

export type InspectionStage
  = | 'github_identity' | 'reviewer_node' | 'app_access'
    | 'station_setup' | 'review_policy' | 'ready';

type Invariant = { code: string; retryable: boolean; pathClass: string };

const invariants: Record<string, Invariant> = {
  'Authenticated GitHub identity mismatch.': {
    code: 'AUTH_IDENTITY_MISMATCH', retryable: false,
    pathClass: 'user_identity',
  },
  'Authenticated Personal Account identity is unavailable.': {
    code: 'AUTH_IDENTITY_UNAVAILABLE', retryable: false,
    pathClass: 'user_identity',
  },
  'Canonical Network Root identity mismatch.': {
    code: 'ROOT_IDENTITY_MISMATCH', retryable: false,
    pathClass: 'repository_metadata',
  },
  'Canonical Network Root surfaces are unavailable.': {
    code: 'ROOT_SURFACE_UNAVAILABLE', retryable: true,
    pathClass: 'repository_content_read',
  },
  'Reviewer Node repository identity mismatch.': {
    code: 'REPOSITORY_IDENTITY_MISMATCH', retryable: false,
    pathClass: 'repository_metadata',
  },
  'Invalid authoritative repository identity.': {
    code: 'REPOSITORY_IDENTITY_MISMATCH', retryable: false,
    pathClass: 'repository_metadata',
  },
  'Expected a regular GitHub file.': {
    code: 'INVALID_GITHUB_FILE', retryable: true,
    pathClass: 'repository_content_read',
  },
  'Multiple qualifying Reviewer Nodes require explicit resolution.': {
    code: 'REVIEWER_NODE_RESOLUTION_REQUIRED', retryable: false,
    pathClass: 'repository_metadata',
  },
};

// Only allowlisted diagnostics and same-request public evidence cross the
// boundary. The original exception is deliberately neither held nor serialized.
export class InspectionFailure extends Error {
  readonly httpStatus: number;
  readonly error: {
    code: string;
    message: string;
    stage: InspectionStage;
    retryable: boolean;
    pathClass?: string;
  };

  constructor(
    stage: InspectionStage,
    cause: unknown,
    public readonly inspection?: PublicInspection,
  ) {
    const upstream = githubFailure(cause);

    const invariant = cause instanceof Error
      ? invariants[cause.message]
      : undefined;

    const message = upstream?.error.message
      ?? 'Could not verify this onboarding stage. '
      + 'Refresh status or resolve the reported condition.';

    super(message);

    this.httpStatus = upstream?.httpStatus
      ?? (invariant?.code === 'REVIEWER_NODE_RESOLUTION_REQUIRED' ? 409 : 422);

    this.error = {
      ...(upstream?.error ?? invariant ?? { code: 'INSPECTION_FAILED', retryable: true }),
      message,
      stage,
    };
  }
}
