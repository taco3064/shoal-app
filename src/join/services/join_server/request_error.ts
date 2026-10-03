import { githubFailure } from '../github_join';
import { InspectionFailure } from '../station_join';
import { json } from './http';

export function requestError(cause: unknown): Response {
  if (cause instanceof InspectionFailure) {
    return json(cause.httpStatus, {
      error: cause.error,
      ...(cause.inspection ? { inspection: cause.inspection } : {}),
    });
  }

  if (cause instanceof Error && isConfigurationError(cause.message)) {
    return json(503, {
      error: {
        code: 'CONFIGURATION_REQUIRED',
        message: cause.message,
      },
    });
  }

  const upstream = githubFailure(cause);

  if (upstream) {
    return json(upstream.httpStatus, { error: upstream.error });
  }

  if (cause instanceof Error
    && cause.message
    === 'Multiple qualifying Reviewer Nodes require explicit resolution.') {
    return json(409, {
      error: {
        code: 'REVIEWER_NODE_RESOLUTION_REQUIRED',
        message: cause.message,
      },
    });
  }

  return json(400, {
    error: {
      code: 'REQUEST_REJECTED',
      message: 'Request rejected. Refresh inspection or authorize again.',
    },
  });
}

function isConfigurationError(message: string): boolean {
  return (
    message.endsWith(' is required')
    || message === 'Production authentication requires HTTPS'
  );
}
