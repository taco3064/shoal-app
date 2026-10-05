import { useCallback, useEffect, useRef, useState } from 'react';
import { hostedClient } from '~app/join/services/hosted_client';
import { resolveJoinServiceUrl } from '~app/join/services/join_client';
import type { Session } from '~app/join/services/join_client';
import type { HostedMode, HostedSettings } from '~app/join/services/hosted_settings';

export default function useHostedSettings(serviceUrl: string, session?: Session) {
  const [settings, setSettings] = useState<HostedSettings>();
  const [choice, setChoice] = useState<HostedMode>();
  const [confirmed, setConfirmed] = useState(false);
  const [connectConfirmed, setConnectConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [external, setExternal] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const popup = useRef<Window | null>(null);
  const resolved = resolveJoinServiceUrl(serviceUrl);
  const client = useRef(resolved ? hostedClient(resolved) : undefined).current;

  const accept = useCallback((value: HostedSettings) => {
    setSettings(value);
    setChoice(value.mode.valid ? value.mode.value ?? 'none' : undefined);
    setConfirmed(false);
    setConnectConfirmed(false);
  }, []);

  const run = useCallback(async (
    operation: () => Promise<HostedSettings>, message = '',
  ) => {
    if (active.current) {
      return;
    }

    const current = generation.current;

    active.current = true;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const value = await operation();

      if (current === generation.current) {
        accept(value);
        setNotice(message);
      }
    } catch (cause) {
      if (current === generation.current) {
        setError(cause instanceof Error
          ? cause.message
          : 'Could not inspect Hosted settings.');
      }
    } finally {
      if (current === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }, [accept]);

  const refresh = useCallback(() => {
    if (client && session) {
      return run(() => client.inspect(session));
    }
  }, [client, session, run]);

  useEffect(() => {
    generation.current += 1;
    active.current = false;
    setSettings(undefined);
    setChoice(undefined);
    setError('');
    setNotice('');
    setBusy(false);
    setExternal(false);
    popup.current?.close();
    popup.current = null;

    if (session) {
      void refresh();
    }

    return () => {
      generation.current += 1;
      popup.current?.close();
      popup.current = null;
    };
  }, [session, refresh]);

  useEffect(() => {
    if (!external) {
      return;
    }

    const finish = () => {
      if (!popup.current || popup.current.closed) {
        setExternal(false);
        popup.current = null;
        void refresh();
      }
    };

    const timer = window.setInterval(finish, 1000);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== new URL(resolved).origin
        || event.source !== popup.current
        || event.data?.type !== 'shoal-hosted-auth') {
        return;
      }

      popup.current?.close();
      popup.current = null;
      finish();
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('focus', finish);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', finish);
      window.removeEventListener('message', onMessage);
    };
  }, [external, refresh, resolved]);

  const connect = async () => {
    if (!client || !session || !settings?.repository || !connectConfirmed
      || active.current || external) {
      return;
    }

    const opened = window.open('about:blank', '_blank', 'popup,width=700,height=760');

    if (!opened) {
      setError('Allow pop-ups, then try connecting Reviewer authority again.');

      return;
    }

    opened.opener = null;
    popup.current = opened;
    active.current = true;
    setBusy(true);
    setError('');
    const current = generation.current;

    try {
      const url = await client.connect(session, settings.repository.id);

      if (current !== generation.current || opened.closed) {
        opened.close();

        return;
      }

      opened.location.replace(url);
      setExternal(true);
    } catch (cause) {
      opened.close();

      setError(cause instanceof Error
        ? cause.message
        : 'Could not start Reviewer authorization.');
    } finally {
      if (current === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
  };

  const repositoryId = settings?.repository?.id;

  return {
    settings, choice, confirmed, connectConfirmed, busy, error, notice, external,
    configured: Boolean(client),
    refresh,
    choose: (mode: HostedMode) => {
      setChoice(mode);
      setConfirmed(false);
      setNotice('');
    },
    setConfirmed,
    setConnectConfirmed,
    connect,
    cancelExternal: () => {
      popup.current?.close();
      popup.current = null;
      setExternal(false);
      void refresh();
    },
    save: () => {
      if (client && session && repositoryId && choice
        && (choice === 'none' || confirmed)) {
        void run(() => client.mode(session, {
          repositoryId, mode: choice, confirmed: choice !== 'none' && confirmed,
        }), 'Hosted mode saved.');
      }
    },
    repair: () => {
      if (client && session && repositoryId) {
        void run(() => client.repair(session, repositoryId),
          'Hosted broker connection restored.');
      }
    },
    disconnect: () => {
      if (client && session && repositoryId) {
        void run(() => client.disconnect(session, repositoryId),
          'Reviewer authority disconnected. Hosted mode is unchanged.');
      }
    },
  };
}
