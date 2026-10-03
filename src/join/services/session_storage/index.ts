import type { Session } from '../join_client';

const storageKey = 'shoal.quickJoin.session';

export function readStoredSession(): Session | undefined {
  try {
    const value = window.sessionStorage.getItem(storageKey);

    if (!value) {
      return undefined;
    }

    const session = JSON.parse(value) as Partial<Session>;

    return typeof session.session === 'string'
      && typeof session.csrfToken === 'string'
      && typeof session.identity?.id === 'number'
      && typeof session.identity.login === 'string'
      ? session as Session
      : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredSession(session: Session | undefined): void {
  try {
    if (session) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Server validation remains authoritative when storage is unavailable.
  }
}
