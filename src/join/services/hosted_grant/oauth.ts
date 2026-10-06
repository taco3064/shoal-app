import { networkRoot } from '~app/protocol/services/network_compatibility';
import { GrantError, type GrantBinding, type GrantOAuth,
  type GrantTokens } from './types';

export interface HostedOAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}
export class HostedOAuthClient implements GrantOAuth {
  constructor(private config: HostedOAuthConfig,
    private request: typeof fetch = (input, init) => fetch(input, init)) {}

  authorization(state: string, challenge: string): string {
    const url = new URL('https://github.com/login/oauth/authorize');

    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.callbackUrl);
    url.searchParams.set('scope', 'public_repo offline_access');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.href;
  }

  private async credentials(input: Record<string, string>): Promise<GrantTokens> {
    const response = await this.request('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.config.clientId,
        client_secret: this.config.clientSecret, ...input }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await response.json() as Record<string, unknown>;

    if (payload.error === 'incorrect_client_credentials') {
      throw new GrantError('GRANT_CLIENT_CONFIG');
    }

    if (payload.error === 'bad_refresh_token' || payload.error === 'invalid_grant') {
      throw new GrantError('GRANT_REVOKED');
    }

    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/[ ,]+/) : [];

    if (!response.ok || payload.token_type !== 'bearer'
      || typeof payload.access_token !== 'string'
      || typeof payload.refresh_token !== 'string'
      || !scopes.includes('public_repo')
      || !Number.isSafeInteger(payload.expires_in)
      || !Number.isSafeInteger(payload.refresh_token_expires_in)
      || (payload.expires_in as number) <= 60
      || (payload.expires_in as number) > 28_800
      || (payload.refresh_token_expires_in as number) <= (payload.expires_in as number)) {
      throw new GrantError('GRANT_RECONSENT');
    }

    const now = Date.now();

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      accessExpires: now + (payload.expires_in as number) * 1000,
      refreshExpires: now + (payload.refresh_token_expires_in as number) * 1000,
    };
  }

  exchange(code: string, verifier: string): Promise<GrantTokens> {
    return this.credentials({ code, code_verifier: verifier,
      redirect_uri: this.config.callbackUrl });
  }

  refresh(token: string): Promise<GrantTokens> {
    return this.credentials({ grant_type: 'refresh_token', refresh_token: token });
  }

  private async github(path: string, token: string): Promise<Record<string, unknown>> {
    const response = await this.request(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'shoal-hosted-grant' },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 401) {
      throw new GrantError('GRANT_REVOKED');
    }

    if (!response.ok) {
      throw new GrantError('GRANT_UNAVAILABLE');
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  async verify(token: string, binding: GrantBinding): Promise<void> {
    const user = await this.github('/user', token);
    const repository = await this.github(`/repositories/${binding.repositoryId}`, token);
    const owner = repository.owner as Record<string, unknown> | undefined;
    const parent = repository.parent as Record<string, unknown> | undefined;
    const root = String(repository.id) === String(networkRoot.repositoryId);

    if (user.type !== 'User' || String(user.id) !== binding.reviewerId
      || String(repository.id) !== binding.repositoryId || repository.private !== false
      || owner?.type !== 'User' || String(owner.id) !== binding.reviewerId
      || (!root && (repository.fork !== true
        || String(parent?.id) !== String(networkRoot.repositoryId)))) {
      throw new GrantError('GRANT_BINDING');
    }
  }

  async revoke(token: string): Promise<void> {
    const response = await this.request(`https://api.github.com/applications/${encodeURIComponent(this.config.clientId)}/grant`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}`,
        Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'shoal-hosted-grant' },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok && response.status !== 404) {
      throw new GrantError('GRANT_UNAVAILABLE');
    }
  }
}
