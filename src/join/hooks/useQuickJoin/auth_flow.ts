import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { joinClient, Session } from '~app/join/services/join_client';
import { writeStoredSession } from '~app/join/services/session_storage';
import type { AuthState } from './state';

type JoinClient = ReturnType<typeof joinClient>;

export function useAuthFlow(options: {
  client?: JoinClient;
  handleError: (cause: unknown) => void;
  setAuthState: Dispatch<SetStateAction<AuthState>>;
  setError: Dispatch<SetStateAction<string>>;
  setSession: Dispatch<SetStateAction<Session | undefined>>;
}) {
  const { client, handleError, setAuthState, setError, setSession } = options;
  const [authenticating, setAuthenticating] = useState(false);
  const popup = useRef<Window | null>(null);

  useEffect(() => {
    if (!client) {
      return;
    }

    const receive = async (event: MessageEvent) => {
      if (
        event.origin !== client.origin
        || !popup.current
        || event.source !== popup.current
      ) {
        return;
      }

      if (event.data?.type === 'shoal-auth-cancelled') {
        setAuthenticating(false);

        setError(
          'GitHub authorization was cancelled. You can retry or continue '
          + 'with the Local / CLI guidance in the staged journey.',
        );

        popup.current.close();
        popup.current = null;
      } else if (
        event.data?.type === 'shoal-auth'
        && typeof event.data.code === 'string'
      ) {
        popup.current.close();
        popup.current = null;

        try {
          const nextSession = await client.session(event.data.code);

          writeStoredSession(nextSession);
          setSession(nextSession);
          setAuthState('authenticated');
          setError('');
        } catch (cause) {
          handleError(cause);
        } finally {
          setAuthenticating(false);
        }
      }
    };

    window.addEventListener('message', receive);

    return () => window.removeEventListener('message', receive);
  }, [client, handleError, setAuthState, setError, setSession]);

  useEffect(() => {
    if (!authenticating) {
      return;
    }

    const timer = setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        setAuthenticating(false);

        setError(
          'GitHub authorization was cancelled. Your public access is unchanged.',
        );
      }
    }, 500);

    return () => clearInterval(timer);
  }, [authenticating, setError]);

  return {
    authenticating,
    authenticate: () => {
      setError('');

      if (!client) {
        return;
      }

      popup.current = window.open(
        client.authUrl,
        'shoal-github-authorization',
        'popup,width=680,height=760',
      );

      setAuthenticating(Boolean(popup.current));

      if (!popup.current) {
        setError('Allow the GitHub authorization popup, then try again.');
      }
    },
    cancelAuth: () => {
      popup.current?.close();
      popup.current = null;
      setAuthenticating(false);
    },
  };
}
