import type { HostedGrantEnvironment } from '../hosted_grant';

export type HostedEnvironment = Partial<HostedGrantEnvironment> & {
  JOIN_SERVICE_ORIGIN: string;
  JOIN_WEBSITE_RETURN_URL: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_SLUG: string;
  HOSTED_BROKER_AUDIENCE?: string;
};

export function hostedConfiguration(env: HostedEnvironment) {
  const origin = new URL(env.JOIN_SERVICE_ORIGIN);

  if (origin.protocol !== 'https:' || origin.username || origin.password) {
    throw new Error('Hosted Review requires the production HTTPS service.');
  }

  return {
    appId: env.GITHUB_APP_ID,
    privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
    installationUrl: `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`,
    brokerUrl: new URL('/hosted/exchange', origin).href,
    brokerAudience: env.HOSTED_BROKER_AUDIENCE ?? 'shoal-hosted-review',
    authorizationAvailable: Boolean(
      env.HOSTED_GRANTS && env.HOSTED_OAUTH_CLIENT_ID
      && env.HOSTED_OAUTH_CLIENT_SECRET
      && env.HOSTED_GRANT_ENCRYPTION_KEY
      && env.HOSTED_GRANT_ENCRYPTION_KEY.length >= 32,
    ),
  };
}

export function grantEnvironment(env: HostedEnvironment): HostedGrantEnvironment {
  if (!hostedConfiguration(env).authorizationAvailable) {
    throw new Error('Recurring Reviewer authorization is unavailable.');
  }

  return env as HostedGrantEnvironment;
}
