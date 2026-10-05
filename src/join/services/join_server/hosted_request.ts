import type { AuthIdentity } from './auth';

export async function forwardHostedRequest(options: {
  request: Request;
  body: Record<string, unknown>;
  session: { id: string; identity: AuthIdentity };
  userToken: (sessionId: string) => Promise<string>;
  handle: (
    request: Request,
    identity: AuthIdentity & { userToken: string },
    sessionId: string,
  ) => Promise<Response>;
}): Promise<Response> {
  const { request, session, body } = options;
  const userToken = await options.userToken(session.id);

  if (!userToken) {
    return Response.json({ error: {
      code: 'SESSION_EXPIRED', message: 'Authorize with GitHub again.',
    } }, { status: 401 });
  }

  return options.handle(new Request(request.url, {
    method: request.method, headers: request.headers, body: JSON.stringify(body),
  }), { ...session.identity, userToken }, session.id);
}
