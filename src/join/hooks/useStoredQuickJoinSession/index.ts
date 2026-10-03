import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { joinClient, Session } from '~app/join/services/join_client';
import { writeStoredSession } from '~app/join/services/session_storage';

type JoinClient = ReturnType<typeof joinClient>;

export default function useStoredQuickJoinSession(options: {
  setAuthState: Dispatch<
    SetStateAction<'unknown' | 'unauthenticated' | 'authenticated' | 'expired'>
  >;
  authenticating: boolean;
  client?: JoinClient;
  hydrated: boolean;
  session?: Session;
  setError: Dispatch<SetStateAction<string>>;
  setSession: Dispatch<SetStateAction<Session | undefined>>;
}) {
  const {
    authenticating,
    client,
    hydrated,
    session,
    setAuthState,
    setError,
    setSession,
  } = options;

  useEffect(() => {
    if (!client || !hydrated || session || authenticating) {
      return;
    }

    let disposed = false;

    const restore = async () => {
      try {
        setAuthState('unknown');

        const restored = await client.restore();

        if (!disposed) {
          setSession(restored);
          writeStoredSession(restored);
          setError('');
          setAuthState('authenticated');
        }
      } catch {
        // Absence of a restorable server session keeps the public page signed out.
        if (!disposed) {
          writeStoredSession(undefined);
          setAuthState('unauthenticated');
          setError('');
        }
      }
    };

    void restore();

    return () => {
      disposed = true;
    };
  }, [
    authenticating,
    client,
    hydrated,
    session,
    setAuthState,
    setError,
    setSession,
  ]);
}
