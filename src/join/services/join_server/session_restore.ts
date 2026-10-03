import { cookie } from './auth';
import type { DurableSession } from './sessions';
import { equalSecret } from './sessions';

export function sessionRestoreMatches(
  request: Request,
  session: DurableSession,
  authorization: string,
): boolean {
  const current = cookie(request, '__Host-shoal-session');

  const currentAuthorization = authorization.startsWith('Session ')
    ? authorization.slice(8)
    : '';

  const currentCsrf = request.headers.get('X-CSRF-Token') ?? '';

  return Boolean(
    (current && equalSecret(current, session.id))
    || (
      currentAuthorization
      && equalSecret(currentAuthorization, session.id)
      && equalSecret(currentCsrf, session.csrf)
    ),
  );
}
