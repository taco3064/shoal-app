import type { AuthIdentity } from './auth';

export function authContext(
  session: { identity: AuthIdentity },
  userToken: string,
): AuthIdentity & { userToken: string } {
  return { ...session.identity, userToken };
}

export function sessionExpired(): Response {
  return Response.json({ error: {
    code: 'SESSION_EXPIRED', message: 'Authorize with GitHub again.',
  } }, { status: 401 });
}
