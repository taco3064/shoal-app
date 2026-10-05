import { openGrant, sealGrant } from './encryption';
import { bindingKey, constantEqual, GrantError, opaque,
  type GrantBinding, type GrantOAuth, type GrantRecord, type GrantStorage,
  type GrantTokens, type GrantView } from './types';

export class HostedGrantStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private options: {
    storage: GrantStorage;
    oauth: GrantOAuth;
    encryptionKey: string;
    now?: () => number;
  }) {}

  private now(): number { return this.options.now?.() ?? Date.now(); }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const work = this.pending.then(task);

    this.pending = work.catch(() => {});

    return work;
  }

  private async load(binding: GrantBinding): Promise<GrantRecord> {
    const record = await this.options.storage.read();

    if (record && bindingKey(record.binding) !== bindingKey(binding)) {
      throw new GrantError('GRANT_BINDING');
    }

    return record ?? { binding, status: 'disconnected' };
  }

  private view(record: GrantRecord): GrantView {
    const status = record.refreshing
      ? 'refresh_ambiguous'
      : record.status === 'connected' && (record.refreshExpires ?? 0) <= this.now()
        ? 'expired'
        : record.status;

    return {
      status,
      accessExpiresAt: record.accessExpires
        ? new Date(record.accessExpires).toISOString()
        : undefined,
      refreshExpiresAt: record.refreshExpires
        ? new Date(record.refreshExpires).toISOString()
        : undefined,
    };
  }

  status(binding: GrantBinding): Promise<GrantView> {
    return this.serial(async () => this.view(await this.load(binding)));
  }

  begin(binding: GrantBinding, sessionId: string): Promise<{
    authorizationUrl: string;
    browserBinding: string;
    state: string;
    launchTicket: string;
  }> {
    return this.serial(async () => {
      if (!sessionId) {
        throw new GrantError('GRANT_AUTH_STATE');
      }

      const record = await this.load(binding);
      const browserBinding = opaque();
      const launchTicket = opaque();
      const verifier = opaque();
      const state = `${binding.repositoryId}.${binding.reviewerId}.${opaque()}`;

      const digest = await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(verifier));

      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      record.pending = { state, launchTicket, launched: false,
        browserBinding, verifier, sessionId,
        expires: this.now() + 600_000 };

      await this.options.storage.write(record);

      return { authorizationUrl: this.options.oauth.authorization(state, challenge),
        browserBinding, state, launchTicket };
    });
  }

  launch(binding: GrantBinding, input: {
    state: string;
    launchTicket: string;
  }): Promise<{ authorizationUrl: string; browserBinding: string }> {
    return this.serial(async () => {
      const record = await this.load(binding);
      const pending = record.pending;

      if (!pending || pending.launched || pending.expires <= this.now()
        || !constantEqual(pending.state, input.state)
        || !constantEqual(pending.launchTicket, input.launchTicket)) {
        throw new GrantError('GRANT_AUTH_STATE');
      }

      pending.launched = true;
      pending.launchTicket = '';
      await this.options.storage.write(record);

      const digest = await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(pending.verifier));

      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      return {
        authorizationUrl: this.options.oauth.authorization(pending.state, challenge),
        browserBinding: pending.browserBinding,
      };
    });
  }

  callback(binding: GrantBinding, input: {
    state: string;
    browserBinding: string;
    code: string;
  }): Promise<GrantView> {
    return this.serial(async () => {
      const record = await this.load(binding);
      const auth = record.pending;

      if (!auth || !auth.launched || auth.expires <= this.now() || !input.code
        || !constantEqual(auth.state, input.state)
        || !constantEqual(auth.browserBinding, input.browserBinding)) {
        throw new GrantError('GRANT_AUTH_STATE');
      }

      delete record.pending;
      await this.options.storage.write(record);
      const tokens = await this.options.oauth.exchange(input.code, auth.verifier);

      await this.options.oauth.verify(tokens.accessToken, binding);
      await this.persistTokens(record, tokens);

      return this.view(record);
    });
  }

  private async persistTokens(record: GrantRecord, tokens: GrantTokens): Promise<void> {
    if (!tokens.accessToken || !tokens.refreshToken
      || !Number.isSafeInteger(tokens.accessExpires)
      || !Number.isSafeInteger(tokens.refreshExpires)
      || tokens.accessExpires <= this.now() + 60_000
      || tokens.accessExpires > this.now() + 28_800_000
      || tokens.refreshExpires <= tokens.accessExpires) {
      throw new GrantError('GRANT_RECONSENT');
    }

    record.sealed = await sealGrant(this.options.encryptionKey, record.binding, tokens);
    record.accessExpires = tokens.accessExpires;
    record.refreshExpires = tokens.refreshExpires;
    record.status = 'connected';
    delete record.refreshing;
    await this.options.storage.write(record);
  }

  token(binding: GrantBinding): Promise<{ token: string; expires: number }> {
    return this.serial(async () => {
      const record = await this.load(binding);
      const status = this.view(record).status;

      if (status !== 'connected' || !record.sealed) {
        throw new GrantError(status === 'expired'
          ? 'GRANT_EXPIRED'
          : status === 'revoked' ? 'GRANT_REVOKED' : 'GRANT_RECONSENT');
      }

      let tokens: GrantTokens;

      try {
        tokens = await openGrant(this.options.encryptionKey, binding, record.sealed);
      } catch {
        await this.clear(record, 'reconsent_required');

        throw new GrantError('GRANT_RECONSENT');
      }

      if (tokens.accessExpires <= this.now() + 300_000) {
        // Commit the intent before a one-use refresh request. A crash/timeout after
        // consumption must never retry the possibly rotated refresh token.
        record.refreshing = true;
        await this.options.storage.write(record);

        try {
          tokens = await this.options.oauth.refresh(tokens.refreshToken);
          await this.options.oauth.verify(tokens.accessToken, binding);
          await this.persistTokens(record, tokens);
        } catch (error) {
          await this.clear(record,
            error instanceof GrantError && error.code === 'GRANT_REVOKED'
              ? 'revoked'
              : error instanceof GrantError
                ? 'reconsent_required'
                : 'refresh_ambiguous');

          throw error instanceof GrantError ? error : new GrantError('GRANT_RECONSENT');
        }
      } else {
        try {
          await this.options.oauth.verify(tokens.accessToken, binding);
        } catch (error) {
          if (error instanceof GrantError && error.code === 'GRANT_REVOKED') {
            await this.clear(record, 'revoked');
          }

          throw error instanceof GrantError ? error : new GrantError('GRANT_UNAVAILABLE');
        }
      }

      return { token: tokens.accessToken, expires: tokens.accessExpires };
    });
  }

  private async clear(record: GrantRecord, status: GrantRecord['status']): Promise<void> {
    delete record.sealed;
    delete record.refreshing;
    delete record.pending;
    delete record.accessExpires;
    delete record.refreshExpires;
    record.status = status;
    await this.options.storage.write(record);
  }

  disconnect(binding: GrantBinding): Promise<GrantView> {
    return this.serial(async () => {
      const record = await this.load(binding);
      let token = '';

      if (record.sealed) {
        try {
          const tokens = await openGrant(this.options.encryptionKey,
            binding, record.sealed);

          token = tokens.accessToken;
        } catch {
          // Erase held authority even when encrypted storage cannot be opened.
        }
      }

      await this.clear(record, 'disconnected');

      if (token) {
        try {
          await this.options.oauth.revoke(token);
        } catch {
          // Local authority is durably gone; external revocation can be retried
          // by the Reviewer from GitHub's authorized-app settings.
        }
      }

      return this.view(record);
    });
  }
}
