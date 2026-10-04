import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Session } from '~app/join/services/join_client';

export function useExternalRefresh(options: {
  refresh: () => void;
  session?: Session;
  setError: Dispatch<SetStateAction<string>>;
}) {
  const { refresh, session, setError } = options;
  const external = useRef<Window | null>(null);
  const externalTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const externalPending = useRef(false);

  const refreshAfterExternal = useCallback(() => {
    if (!externalPending.current) {
      return;
    }

    externalPending.current = false;
    external.current = null;

    if (externalTimer.current) {
      clearInterval(externalTimer.current);
      externalTimer.current = null;
    }

    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const onReturn = () => {
      if (document.visibilityState === 'visible') {
        refreshAfterExternal();
      }
    };

    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);

    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [session, refreshAfterExternal]);

  useEffect(() => () => {
    if (externalTimer.current) {
      clearInterval(externalTimer.current);
      externalTimer.current = null;
    }
  }, []);

  return (url: string) => {
    if (externalTimer.current) {
      clearInterval(externalTimer.current);
      externalTimer.current = null;
    }

    externalPending.current = true;
    external.current = window.open(url, 'shoal-external-step');

    if (!external.current) {
      setError('Open the external GitHub step, then use Continue in the current step.');

      return;
    }

    try {
      external.current.opener = null;
    } catch {
      // Some browsers expose a restricted WindowProxy for external tabs.
    }

    externalTimer.current = setInterval(() => {
      if (external.current?.closed) {
        refreshAfterExternal();
      }
    }, 500);
  };
}
