export type PolicyDecision = ReturnType<typeof publicPolicyDecision>;

export function publicPolicyDecision(publicValue: object) {
  const value = publicValue as {
    policy?: { content?: unknown };
    repository?: { id?: unknown } | null;
    rootHead?: unknown;
    nodeHead?: unknown;
  };

  return {
    repositoryId: typeof value.repository?.id === 'number'
      ? value.repository.id
      : null,
    rootHead: typeof value.rootHead === 'string' ? value.rootHead : '',
    nodeHead: typeof value.nodeHead === 'string' ? value.nodeHead : null,
    policyContent:
      typeof value.policy?.content === 'string' ? value.policy.content : '',
  };
}

export function applyPolicyCompletion(
  session: { policyDecision?: PolicyDecision },
  publicValue: object,
): object {
  const current = publicPolicyDecision(publicValue);
  const decision = session.policyDecision;

  const policyComplete = Boolean(
    decision
    && decision.repositoryId === current.repositoryId
    && decision.rootHead === current.rootHead
    && decision.nodeHead === current.nodeHead
    && decision.policyContent === current.policyContent,
  );

  if (decision && !policyComplete) {
    delete session.policyDecision;
  }

  return { ...publicValue, policyComplete };
}

export function acceptPolicyResult(
  session: { policyDecision?: PolicyDecision },
  result: object,
): object {
  const inspection = (result as { inspection: object }).inspection;

  session.policyDecision = publicPolicyDecision(inspection);

  return {
    ...result,
    inspection: applyPolicyCompletion(session, inspection),
  };
}
