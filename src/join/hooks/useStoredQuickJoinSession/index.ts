import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { joinClient, Session } from '~app/join/services/join_client';
import {
  readStoredSession,
  writeStoredSession,
} from '~app/join/services/session_storage';

type JoinClient = ReturnType<typeof joinClient>;

export default function useStoredQuickJoinSession(options: {
  authenticating: boolean;
  client?: JoinClient;
  hydrated: boolean;
  session?: Session;
  setError: Dispatch<SetStateAction<string>>;
  setSession: Dispatch<SetStateAction<Session | undefined>>;
}) {
  const { authenticating, client, hydrated, session, setError, setSession } = options;

  useEffect(() => {
    if (!client || !hydrated || session || authenticating) {
      return;
    }

    const stored = readStoredSession();

    if (stored) {
      setSession(stored);

      return;
    }

    let disposed = false;

    const restore = async () => {
      try {
        const restored = await client.restore();

        if (!disposed) {
          setSession(restored);
          writeStoredSession(restored);
          setError('');
        }
      } catch {
        // Absence of a restorable server session keeps the public page signed out.
      }
    };

    void restore();

    return () => {
      disposed = true;
    };
  }, [authenticating, client, hydrated, session, setError, setSession]);
}
