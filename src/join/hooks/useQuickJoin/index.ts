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
import { useAuthFlow } from './auth_flow';
import { useExternalRefresh } from './external_refresh';
import type { AuthState, ExecutionState, InspectionState } from './state';

export {
  canonicalJoinGuidance,
  findJoinGuidance,
} from '~app/join/services/join_guidance';

export default function useQuickJoin(serviceUrl: string) {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<Session>();

  const [authState, setAuthState] = useState<AuthState>('unknown');

  const [inspectionState, setInspectionState] = useState<InspectionState>('idle');

  const [inspection, setInspection] = useState<Inspection>();
  const [executionStages, setExecutionStages] = useState<Stage[]>();

  const [executionState, setExecutionState] = useState<ExecutionState>('none');

  const [job, setJob] = useState<Job>();
  const [jobId, setJobId] = useState<string>();
  const [policyPlan, setPolicyPlan] = useState<PolicyPlan>();
  const [policyChoice, setPolicyChoice] = useState<'keep' | 'default' | 'custom'>('keep');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const busyRef = useRef(false);
  const refreshGeneration = useRef(0);

  const resolvedServiceUrl = resolveJoinServiceUrl(serviceUrl);

  const client = useRef(
    resolvedServiceUrl ? joinClient(resolvedServiceUrl) : undefined,
  ).current;

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const acceptInspection = useCallback((value: Inspection) => {
    setInspection(value);
    setInspectionState('verified');
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
      setAuthState(cause.code === 'SESSION_EXPIRED' ? 'expired' : 'unauthenticated');
      setInspectionState('idle');
      setExecutionState('none');
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
      setInspectionState('stale');
      setInspection(undefined);
    } else if (session) {
      setInspectionState('failed');
      setInspection(cause instanceof JoinError ? cause.inspection : undefined);
      setExecutionStages(undefined);
      setPolicyPlan(undefined);
      setContent('');
      setStale(false);
    }
  }, [session]);

  const { authenticating, authenticate, cancelAuth } = useAuthFlow({
    client,
    handleError,
    setAuthState,
    setError,
    setSession,
  });

  useStoredQuickJoinSession({
    authenticating,
    client,
    hydrated,
    session,
    setAuthState,
    setError,
    setSession,
  });

  const recoverCurrentJob = useCallback(async (generation: number) => {
    if (!client || !session) {
      return false;
    }

    try {
      const current = await client.currentStatus(session);

      if (refreshGeneration.current !== generation) {
        return false;
      }

      setJob(current);
      setJobId(current.id);
      setExecutionState(current.status);
      setBusy(current.status === 'queued' || current.status === 'running');

      return true;
    } catch {
      return false;
    }
  }, [client, session]);

  const refresh = useCallback(async () => {
    if (!client || !session || busyRef.current) {
      return;
    }

    const generation = refreshGeneration.current + 1;

    refreshGeneration.current = generation;
    busyRef.current = true;
    setBusy(true);
    setInspectionState('verifying');
    setError('');
    setJobId(undefined);
    setJob(undefined);
    setExecutionState('none');
    setExecutionStages(undefined);
    let recoveredJob = false;

    try {
      const nextInspection = await client.inspect(session);

      if (refreshGeneration.current === generation) {
        acceptInspection(nextInspection);

        return nextInspection;
      }
    } catch (cause) {
      if (refreshGeneration.current !== generation) {
        return;
      }

      if (
        cause instanceof JoinError
        && cause.code === 'OPERATION_RUNNING'
        && await recoverCurrentJob(generation)
      ) {
        recoveredJob = true;
        setInspectionState('stale');

        return;
      }

      if (refreshGeneration.current === generation) {
        handleError(cause);
      }
    } finally {
      if (refreshGeneration.current === generation) {
        busyRef.current = recoveredJob;
        setBusy(recoveredJob);
      }
    }
  }, [client, session, acceptInspection, handleError, recoverCurrentJob]);

  useEffect(() => {
    refreshGeneration.current += 1;
    busyRef.current = false;

    if (session) {
      void refresh();
    }

    return () => {
      refreshGeneration.current += 1;
    };
  }, [session, refresh]);

  const { openExternal, externalRecovery, cancelExternal } = useExternalRefresh({
    refresh,
    session,
    inspection, authState, busyRef,
    setError,
  });

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
        setExecutionState(value.status);

        if (value.result) {
          acceptInspection(value.result);
        }

        if (value.status === 'running' || value.status === 'queued') {
          timer = setTimeout(() => void poll(), 1000);
        } else {
          if (value.status === 'complete') {
            const fresh = await client.inspect(session);

            if (disposed) {
              return;
            }

            acceptInspection(fresh);
          }

          setBusy(false);
          busyRef.current = false;

          if (value.error) {
            handleError(new JoinError(
              value.error.message, value.error.code, value.error,
            ));

            if (value.result) {
              setInspection(value.result);
            }
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

  const run = async (policy = false) => {
    const planId = policy ? policyPlan?.planId : inspection?.planId;

    if (!client || !session || !planId || busy) {
      return;
    }

    setBusy(true);
    busyRef.current = true;
    setExecutionState('queued');
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
      setExecutionState('queued');
    } catch (cause) {
      handleError(cause);
      setBusy(false);
      busyRef.current = false;
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

      acceptInspection(fresh);

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
    refreshGeneration.current += 1;
    cancelExternal();

    if (client && session) {
      try {
        await client.logout(session);
      } catch (cause) {
        handleError(cause);
      }
    }

    setSession(undefined);
    setAuthState('unauthenticated');
    writeStoredSession(undefined);
    setInspection(undefined);
    setInspectionState('idle');
    setJob(undefined);
    setJobId(undefined);
    setPolicyPlan(undefined);
    setExecutionState('none');
    setBusy(false);
    busyRef.current = false;
  };

  return {
    session,
    inspection,
    executionStages,
    job,
    authState,
    inspectionState,
    executionState,
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
    externalRecovery,
    execute: () => void run(),
    confirmPolicy: () => void run(true),
    cancelAuth,
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
