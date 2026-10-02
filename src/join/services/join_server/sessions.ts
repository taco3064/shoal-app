import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type { AuthIdentity } from './auth';
import type { Job } from './execution';

export interface HeldPlan {
  id: string;
  kind: 'station' | 'policy';
  value: unknown;
  expires: number;
}

export interface DurableSession {
  identity: AuthIdentity;
  id: string;
  csrf: string;
  expires: number;
  handoff?: { code: string; expires: number };
  plan?: HeldPlan;
  job?: Job & { id: string };
  busy: boolean;
  execution?: { kind: 'station' | 'policy'; value: unknown };
}

export interface DurableFlow {
  auth?: { state: string; binding: string; verifier: string; expires: number };
  session?: DurableSession;
}

export function opaqueId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function equalSecret(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

/** One bounded record per isolated flow; secrets are never accepted by this schema. */
export class FlowStorage {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS flow '
      + '(id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)',
    );
  }

  read(): DurableFlow {
    const rows = this.storage.sql
      .exec<{ value: string }>('SELECT value FROM flow WHERE id = 1')
      .toArray();

    return rows.length ? (JSON.parse(rows[0].value) as DurableFlow) : {};
  }

  async write(flow: DurableFlow): Promise<void> {
    this.storage.sql.exec(
      'INSERT INTO flow (id, value) VALUES (1, ?) '
      + 'ON CONFLICT(id) DO UPDATE SET value = excluded.value',
      JSON.stringify(flow),
    );

    const expiry = flow.session?.expires ?? flow.auth?.expires;

    if (expiry) {
      await this.storage.setAlarm(
        flow.session?.busy ? Date.now() + 100 : expiry,
      );
    } else {
      this.storage.sql.exec('DELETE FROM flow');
      await this.storage.deleteAlarm();
    }
  }

  async schedule(): Promise<void> {
    await this.storage.setAlarm(Date.now() + 100);
  }

  async clear(): Promise<void> {
    this.storage.sql.exec('DELETE FROM flow');
    await this.storage.deleteAlarm();
  }
}
