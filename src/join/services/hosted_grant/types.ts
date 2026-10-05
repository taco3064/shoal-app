export interface GrantBinding {
  reviewerId: string;
  repositoryId: string;
}
export type GrantStatus = 'disconnected' | 'connected' | 'expired'
  | 'revoked' | 'reconsent_required' | 'refresh_ambiguous';
export interface GrantView {
  status: GrantStatus;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
}
export interface GrantTokens {
  accessToken: string;
  refreshToken: string;
  accessExpires: number;
  refreshExpires: number;
}
export interface GrantRecord {
  binding: GrantBinding;
  status: GrantStatus;
  sealed?: { iv: string; ciphertext: string };
  accessExpires?: number;
  refreshExpires?: number;
  refreshing?: boolean;
  pending?: {
    state: string;
    launchTicket: string;
    launched: boolean;
    browserBinding: string;
    verifier: string;
    sessionId: string;
    expires: number;
  };
}
export interface GrantStorage {
  read(): Promise<GrantRecord | undefined>;
  write(record: GrantRecord): Promise<void>;
}
export interface GrantOAuth {
  authorization(state: string, challenge: string): string;
  exchange(code: string, verifier: string): Promise<GrantTokens>;
  refresh(token: string): Promise<GrantTokens>;
  verify(token: string, binding: GrantBinding): Promise<void>;
  revoke(token: string): Promise<void>;
}
export class GrantError extends Error {
  constructor(public code: 'GRANT_UNAVAILABLE' | 'GRANT_REVOKED'
    | 'GRANT_EXPIRED' | 'GRANT_RECONSENT' | 'GRANT_BINDING' | 'GRANT_AUTH_STATE') {
    super('Recurring Reviewer authority is unavailable. Reconnect explicitly.');
  }
}

export function bindingKey(binding: GrantBinding): string {
  if (!/^[1-9]\d{0,15}$/.test(binding.reviewerId)
    || !/^[1-9]\d{0,15}$/.test(binding.repositoryId)) {
    throw new GrantError('GRANT_BINDING');
  }

  return `${binding.reviewerId}:${binding.repositoryId}`;
}

export function opaque(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function constantEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}
