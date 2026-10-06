import { boundedJson } from './bounded_json';
import { GitHubError } from '../github_join';
import { authenticateExecution } from './execution_identity';
import { verifyGitHubOidc } from './oidc';
import type { BrokerAuthority, BrokerOptions, BrokerRequest } from './types';

export type {
  BrokerAuthority,
  BrokerIdentity,
  BrokerOptions,
  BrokerRepository,
  BrokerRequest,
  BrokerRun,
  HostedBrokerGithub,
} from './types';

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function validateEndpoint(options: BrokerOptions): boolean {
  const endpoint = new URL(options.endpoint);
  const requested = new URL(options.request.url);

  return endpoint.protocol === 'https:' && requested.href === endpoint.href
    && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash
    && options.audience.length > 0 && options.audience.length <= 512
    && options.request.method === 'POST';
}

async function readBoundedBody(request: Request): Promise<BrokerRequest> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/json'
    || !request.body) {
    throw new Error('REQUEST_REFUSED');
  }

  const body = await boundedJson(request.body, 4096);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('REQUEST_REFUSED');
  }

  const value = body as Record<string, unknown>;

  const fields = [
    'repositoryId', 'reviewerId', 'workflowRef', 'workflowSha', 'runId', 'runAttempt',
  ];

  if (value.formatVersion !== 1 || Object.keys(value).length !== 7
    || fields.some((field) => typeof value[field] !== 'string')
    || ['repositoryId', 'reviewerId', 'runId', 'runAttempt']
      .some((field) => !/^[1-9][0-9]{0,15}$/.test(String(value[field])))
      || !/^[a-f0-9]{40}$/.test(String(value.workflowSha))
      || String(value.workflowRef).length > 1024) {
    throw new Error('REQUEST_REFUSED');
  }

  return value as BrokerRequest;
}

function validateAuthority(authority: BrokerAuthority, now: number): boolean {
  const expires = Date.parse(authority.expiresAt);

  return typeof authority.reviewerToken === 'string'
    && typeof authority.lifecycleToken === 'string'
    && /^[A-Za-z0-9_.-]{20,2048}$/.test(authority.reviewerToken)
    && /^[A-Za-z0-9_.-]{20,2048}$/.test(authority.lifecycleToken)
    && authority.reviewerToken !== authority.lifecycleToken
    && Number.isFinite(expires) && expires > now + 60000
    && expires <= now + 8 * 60 * 60 * 1000;
}

export async function exchangeHostedAuthority(options: BrokerOptions): Promise<Response> {
  let stage = 'endpoint';

  const refuse = (code: string, status: number, cause?: unknown) => {
    const known = ['OIDC_REFUSED', 'EXECUTION_REFUSED', 'REQUEST_REFUSED',
      'OIDC_TIME_REFUSED', 'OIDC_HEADER_REFUSED', 'OIDC_JWKS_REFUSED',
      'OIDC_KEY_REFUSED', 'OIDC_SIGNATURE_REFUSED', 'EXECUTION_REPOSITORY_REFUSED',
      'EXECUTION_CLAIMS_REFUSED', 'EXECUTION_RUN_REFUSED', 'EXECUTION_CAPABILITY_REFUSED',
      'INPUT_REFUSED', 'INPUT_TIMEOUT', 'GRANT_BINDING', 'GRANT_REVOKED',
      'GRANT_EXPIRED', 'GRANT_RECONSENT', 'GRANT_UNAVAILABLE'];

    const reason = cause instanceof GitHubError
      ? 'GITHUB_UPSTREAM'
      : cause instanceof Error && known.includes(cause.message)
        ? cause.message
        : cause === undefined ? code : 'UNEXPECTED';

    const operations = ['user_identity', 'owner_repository_discovery',
      'root_fork_discovery', 'repository_content_read', 'repository_actions',
      'installation_token', 'app_installation_binding', 'git_data',
      'repository_metadata', 'github_api'];

    const details = cause instanceof GitHubError ? cause.details : undefined;

    const operation = details && operations.includes(details.pathClass)
      ? details.pathClass
      : 'unknown';

    const rateLimit = details?.rateLimitClass === 'primary'
      || details?.rateLimitClass === 'secondary'
      ? details.rateLimitClass
      : 'none';

    try {
      options.reportFailure?.({ stage, reason, operation, rateLimit,
        status: cause instanceof GitHubError && Number.isInteger(cause.status)
          && cause.status >= 0 && cause.status <= 599
          ? cause.status
          : 0 });
    } catch {
      // Diagnostics cannot change the broker's refusal behavior.
    }

    return response({ code }, status);
  };

  try {
    if (!validateEndpoint(options)) {
      return refuse('BROKER_CONFIGURATION_REFUSED', 400);
    }

    stage = 'request';
    const header = options.request.headers.get('Authorization');

    if (!header || !/^Bearer [A-Za-z0-9_.-]+$/.test(header)) {
      return refuse('MACHINE_IDENTITY_REFUSED', 401);
    }

    const request = await readBoundedBody(options.request);
    const now = options.now ?? Date.now;

    stage = 'oidc';

    const claims = await verifyGitHubOidc({
      token: header.slice(7),
      audience: options.audience,
      now: now(),
      fetcher: options.fetcher ?? fetch,
    });

    stage = 'execution';

    const identity = await authenticateExecution({
      request, claims, github: options.github,
    });

    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now()) {
      return refuse('MACHINE_IDENTITY_REFUSED', 401);
    }

    stage = 'authority';

    const authority = await options.issueAuthority(identity);

    stage = 'result';

    if (!validateAuthority(authority, now())) {
      return refuse('REVIEWER_AUTHORITY_UNAVAILABLE', 503);
    }

    // Explicit projection prevents an issuer's accidental refresh/debug field
    // from crossing the machine response boundary.
    return response({
      formatVersion: 1,
      repositoryId: identity.repositoryId,
      reviewerId: identity.reviewerId,
      reviewerToken: authority.reviewerToken,
      lifecycleToken: authority.lifecycleToken,
      expiresAt: authority.expiresAt,
    }, 200);
  } catch (cause) {
    // Never reflect GitHub errors, assertions, secrets, headers or issuer faults.
    return refuse('REVIEWER_AUTHORITY_UNAVAILABLE', 403, cause);
  }
}
