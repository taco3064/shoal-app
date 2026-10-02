import type { DurableObjectNamespace } from '@cloudflare/workers-types';
export interface JoinConfig {
  appId: string;
  installationUrl: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  serviceOrigin: string;
  websiteOrigin: string;
  returnUrl: string;
}

export interface JoinEnvironment {
  JOIN_FLOWS: DurableObjectNamespace;
  GITHUB_APP_ID: string;
  GITHUB_APP_SLUG: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  JOIN_SERVICE_ORIGIN: string;
  JOIN_WEBSITE_RETURN_URL: string;
}

export function loadJoinConfig(
  env: Omit<JoinEnvironment, 'JOIN_FLOWS'>,
): JoinConfig {
  const required = (
    name: keyof Omit<JoinEnvironment, 'JOIN_FLOWS'>,
  ): string => {
    const value = env[name];

    if (!value) {
      throw new Error(`${name} is required`);
    }

    return value;
  };

  const service = new URL(required('JOIN_SERVICE_ORIGIN'));
  const returnUrl = new URL(required('JOIN_WEBSITE_RETURN_URL'));

  if (
    service.protocol !== 'https:'
    || returnUrl.protocol !== 'https:'
    || service.username
    || service.password
    || returnUrl.username
    || returnUrl.password
  ) {
    throw new Error('Production authentication requires HTTPS');
  }

  return {
    appId: required('GITHUB_APP_ID'),
    installationUrl: `https://github.com/apps/${required('GITHUB_APP_SLUG')}/installations/new`,
    privateKey: required('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
    clientId: required('GITHUB_APP_CLIENT_ID'),
    clientSecret: required('GITHUB_APP_CLIENT_SECRET'),
    serviceOrigin: service.origin,
    websiteOrigin: returnUrl.origin,
    returnUrl: returnUrl.href,
  };
}
