import { useCallback, useEffect, useRef, useState } from 'react';
import {
  JoinError,
  joinClient,
  resolveJoinServiceUrl,
} from '~app/join/services/join_client';
import useStoredQuickJoinSession from '../useStoredQuickJoinSession';
import type {
  Inspection,
  Job,
  PolicyPlan,
  Session,
  Stage,
} from '~app/join/services/join_client';
import { writeStoredSession } from '~app/join/services/session_storage';

export default function useQuickJoin(serviceUrl: string) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session>();
  const [inspection, setInspection] = useState<Inspection>();
  const [executionStages, setExecutionStages] = useState<Stage[]>();
  const [job, setJob] = useState<Job>();
  const [jobId, setJobId] = useState<string>();
  const [policyPlan, setPolicyPlan] = useState<PolicyPlan>();
  const [policyChoice, setPolicyChoice] = useState<'keep' | 'default' | 'custom'>('keep');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [stale, setStale] = useState(false);
  const popup = useRef<Window | null>(null);
  const external = useRef<Window | null>(null);
  const externalTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const externalPending = useRef(false);
  const busyRef = useRef(false);

  const resolvedServiceUrl = resolveJoinServiceUrl(serviceUrl);

  const client = useRef(
    resolvedServiceUrl ? joinClient(resolvedServiceUrl) : undefined,
  ).current;

  useEffect(() => {
    setHydrated(true);
  }, []);

  useStoredQuickJoinSession({
    authenticating,
    client,
    hydrated,
    session,
    setError,
    setSession,
  });

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const acceptInspection = useCallback((value: Inspection) => {
    setInspection(value);
    setExecutionStages(undefined);
    setContent(value.policy?.current ?? '');
    setPolicyChoice(value.policy?.isDefault ? 'default' : 'keep');
    setPolicyPlan(undefined);
    setStale(false);
  }, []);

  const handleError = useCallback((cause: unknown) => {
    if (
      cause instanceof JoinError
      && (cause.code === 'SESSION_EXPIRED' || cause.code === 'CSRF_DENIED')
    ) {
      writeStoredSession(undefined);
      setSession(undefined);
      setInspection(undefined);
      setPolicyPlan(undefined);
      setJob(undefined);
      setJobId(undefined);
    }

    setError(
      cause instanceof Error
        ? cause.message
        : 'Could not complete Quick Web Join.',
    );

    if (cause instanceof JoinError && /stale|concurrent/i.test(cause.code)) {
      setStale(true);
      setPolicyPlan(undefined);
      setInspection(undefined);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!client || !session || busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError('');
    setJobId(undefined);
    setJob(undefined);
    setExecutionStages(undefined);

    try {
      acceptInspection(await client.inspect(session));
    } catch (cause) {
      handleError(cause);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [client, session, acceptInspection, handleError]);

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

    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (session) {
      void refresh();
    }
  }, [session, refresh]);

  useEffect(() => {
    if (!client || !session || !jobId) {
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const value = await client.status(session, jobId);

        if (disposed) {
          return;
        }

        setJob(value);

        if (value.result) {
          acceptInspection(value.result);
        }

        if (value.status === 'running' || value.status === 'queued') {
          timer = setTimeout(() => void poll(), 1000);
        } else {
          if (value.status === 'complete') {
            acceptInspection(await client.inspect(session));
          }

          setBusy(false);

          if (value.error) {
            handleError(new JoinError(value.error.message, value.error.code));
          }
        }
      } catch (cause) {
        if (!disposed) {
          handleError(cause);
          setBusy(false);
        }
      }
    };

    void poll();

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [client, session, jobId, acceptInspection, handleError]);

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
  }, [client, handleError]);

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
  }, [authenticating]);

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

  const authenticate = () => {
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
  };

  const openExternal = (url: string) => {
    if (externalTimer.current) {
      clearInterval(externalTimer.current);
      externalTimer.current = null;
    }

    externalPending.current = true;
    external.current = window.open(url, 'shoal-external-step');

    if (!external.current) {
      setError('Open the external GitHub step, then use Refresh status.');

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

  const run = async (policy = false) => {
    const planId = policy ? policyPlan?.planId : inspection?.planId;

    if (!client || !session || !planId || busy) {
      return;
    }

    setBusy(true);
    setError('');

    setExecutionStages(
      inspection?.stages.map((stage) =>
        stage.id === (policy ? 'policy' : 'station')
          ? { ...stage, state: 'executing' }
          : stage,
      ),
    );

    setJob({
      status: 'queued',
      progress: {
        completed: 0,
        total: policy
          ? Number(policyPlan?.changes)
          : inspection!.operations.length,
        verifiedOperations: [],
        operations: (policy
          ? policyPlan?.changes ? ['write_policy'] : []
          : inspection!.operations.map((operation) => operation.id))
          .map((name) => ({ name, state: 'queued' })),
      },
    });

    try {
      const value = policy
        ? await client.confirmPolicy(session, planId)
        : await client.execute(session, planId);

      setJobId(value.jobId);
    } catch (cause) {
      handleError(cause);
      setBusy(false);
    }
  };

  const previewPolicy = async () => {
    if (!client || !session || !inspection || busy) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      const fresh = await client.inspect(session);

      setInspection(fresh);

      setPolicyPlan(
        await client.policy(
          session,
          fresh.planId,
          policyChoice,
          policyChoice === 'custom' ? content : undefined,
        ),
      );
    } catch (cause) {
      handleError(cause);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (client && session) {
      try {
        await client.logout(session);
      } catch (cause) {
        handleError(cause);
      }
    }

    setSession(undefined);
    writeStoredSession(undefined);
    setInspection(undefined);
    setJob(undefined);
    setJobId(undefined);
    setPolicyPlan(undefined);
    setBusy(false);
  };

  return {
    session,
    inspection,
    executionStages,
    job,
    policyPlan,
    policyChoice,
    content,
    error,
    busy,
    authenticating,
    stale,
    enabled: Boolean(client) && hydrated,
    configured: Boolean(client),
    authenticate,
    refresh,
    previewPolicy,
    logout,
    openExternal,
    execute: () => void run(),
    confirmPolicy: () => void run(true),
    cancelAuth: () => {
      popup.current?.close();
      popup.current = null;
      setAuthenticating(false);
    },
    choosePolicy: (choice: 'keep' | 'default' | 'custom') => {
      setPolicyChoice(choice);
      setPolicyPlan(undefined);
    },
    editPolicy: (value: string) => {
      setContent(value);
      setPolicyPlan(undefined);
    },
  };
}
