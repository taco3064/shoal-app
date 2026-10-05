import { exchangeHostedAuthority } from '../hosted_broker';
import { brokerGithub } from './broker_github';
import { hostedConfiguration, type HostedEnvironment } from './config';
import { issueHostedAuthority } from './authority';
import { handleHostedCallback } from './oauth_callback';
import { handleHostedStart } from './oauth_start';

export async function handleHostedPublic(
  request: Request, env: HostedEnvironment,
): Promise<Response> {
  const path = new URL(request.url).pathname;

  if (path === '/hosted/auth/callback') {
    return handleHostedCallback(request, env);
  }

  if (path === '/hosted/auth/start') {
    return handleHostedStart(request, env);
  }

  if (path !== '/hosted/exchange') {
    return new Response(null, { status: 404 });
  }

  const config = hostedConfiguration(env);

  return exchangeHostedAuthority({
    request, endpoint: config.brokerUrl, audience: config.brokerAudience,
    github: brokerGithub(env),
    issueAuthority: (identity) => issueHostedAuthority(env, identity),
  });
}
