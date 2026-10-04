import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Inspection, Session } from '~app/join/services/join_client';
import {
  externalHintLifetime,
  readExternalHint,
  writeExternalHint,
} from '~app/join/services/external_action_hint';
import type { ExternalActionHint } from '~app/join/services/external_action_hint';
import type { AuthState } from './state';

type Options = {
  refresh: () => Promise<Inspection | undefined>;
  session?: Session;
  inspection?: Inspection;
  authState: AuthState;
  busyRef: RefObject<boolean>;
  setError: Dispatch<SetStateAction<string>>;
};
const retryDelays = [1000, 2500, 5000];
const returnWindow = 15_000;

export function useExternalRefresh(options: Options) {
  const latest = useRef(options);

  latest.current = options;

  const hint = useRef<ExternalActionHint | undefined>(undefined);
  const external = useRef<Window | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const epoch = useRef(0);
  const reconciling = useRef(false);
  const [externalRecovery, setExternalRecovery] = useState(false);

  const stop = useCallback(() => {
    epoch.current += 1;
    reconciling.current = false;
    clearTimeout(retry.current);
    clearTimeout(deadline.current);
  }, []);

  const clear = useCallback(() => {
    stop();
    clearInterval(polling.current);
    external.current = null;
    hint.current = undefined;
    writeExternalHint();
    setExternalRecovery(false);
  }, [stop]);

  const reconcile = useCallback(() => {
    const current = hint.current;
    const { session } = latest.current;

    if (!current || !session || document.visibilityState !== 'visible'
      || current.identityId !== session.identity.id || reconciling.current) {
      return;
    }

    if (Date.now() - current.startedAt >= externalHintLifetime) {
      clear();
      setExternalRecovery(true);

      return;
    }

    reconciling.current = true;
    const generation = ++epoch.current;
    let attempt = 0;

    const exhausted = () => {
      stop();
      setExternalRecovery(true);
    };

    deadline.current = setTimeout(exhausted, returnWindow);

    const inspect = async () => {
      if (epoch.current !== generation || !hint.current
        || document.visibilityState !== 'visible') {
        return;
      }

      const value = latest.current.busyRef.current
        ? undefined
        : await latest.current.refresh();

      if (epoch.current !== generation || hint.current !== current) {
        return;
      }

      if (value?.rootOwner
        || value?.stages.some((stage) =>
          stage.id === current.stageId && stage.state === 'complete',
        )) {
        clear();

        return;
      }

      const delay = retryDelays[attempt++];

      if (delay === undefined) {
        exhausted();
      } else {
        retry.current = setTimeout(() => void inspect(), delay);
      }
    };

    void inspect();
  }, [clear, stop]);

  useEffect(() => {
    if (!options.session) {
      if (options.authState === 'unauthenticated' || options.authState === 'expired') {
        clear();
      }

      return;
    }

    hint.current = readExternalHint(options.session.identity.id) ?? hint.current;

    if (hint.current?.identityId !== options.session.identity.id) {
      clear();
    }

    const suspend = () => {
      stop();
      clearInterval(polling.current);
    };

    const onReturn = () => {
      if (document.visibilityState === 'visible') {
        reconcile();
      } else {
        suspend();
      }
    };

    window.addEventListener('focus', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', onReturn);
    reconcile();

    return () => {
      stop();
      clearInterval(polling.current);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('pageshow', onReturn);
      window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [options.session, options.authState, clear, reconcile, stop]);

  useEffect(() => {
    const current = hint.current;

    if (current && (options.inspection?.rootOwner
      || options.inspection?.stages.some((stage) =>
        stage.id === current.stageId && stage.state === 'complete',
      ))) {
      clear();
    }
  }, [options.inspection, clear]);

  const openExternal = (url: string) => {
    const { session, inspection, setError } = latest.current;

    const stage = inspection?.stages.find((item) =>
      item.state === 'current'
      && (item.action === 'fork' || item.action === 'app_access'),
    );

    if (!session || !stage || (stage.id !== 'node' && stage.id !== 'access')) {
      return;
    }

    clear();

    hint.current = {
      stageId: stage.id,
      identityId: session.identity.id,
      startedAt: Date.now(),
    };

    writeExternalHint(hint.current);
    external.current = window.open(url, 'shoal-external-step');

    if (!external.current) {
      setExternalRecovery(true);

      setError(
        'Open the external GitHub step, then use Check again in the current step.',
      );
    } else {
      try {
        external.current.opener = null;
      } catch {
        // Cross-origin WindowProxy access may be restricted.
      }
    }

    polling.current = setInterval(() => {
      if (document.visibilityState !== 'visible' || !hint.current) {
        clearInterval(polling.current);
      } else if (Date.now() - hint.current.startedAt >= externalHintLifetime) {
        clear();
        setExternalRecovery(true);
      } else {
        try {
          if (external.current?.closed) {
            clearInterval(polling.current);
            external.current = null;
            reconcile();
          }
        } catch {
          // Focus / visibility / pageshow do not require a usable handle.
          clearInterval(polling.current);
        }
      }
    }, 500);
  };

  return { openExternal, externalRecovery, cancelExternal: clear };
}
