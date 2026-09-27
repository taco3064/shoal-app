import { reviewProtocol } from './contract';
import type {
  AdmissionRecord,
  AutomationProvenance,
  JudgmentEvent,
  JudgmentType,
  LifecycleEvent,
  LifecycleType,
  ParsedProtocolComment,
  ReReviewReason,
  ReviewVerdict,
} from './types';

const commitPattern = /^[0-9a-f]{40}$/;
const repositoryNamePattern = /^[A-Za-z0-9_.-]+$/;
const repositoryFullNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function getProtocolVersion(): number {
  return Number(reviewProtocol.protocolVersion);
}

export function parseProtocolComment(body: string): ParsedProtocolComment {
  const trimmed = body.trim();

  if (trimmed.startsWith(reviewProtocol.admission.marker)) {
    const parsed = parseMarkerJson(trimmed);
    const admission = parsed ? parseAdmissionRecord(parsed) : null;

    if (admission) {
      return { kind: 'admission', value: admission };
    }

    return isFormalResultCandidate(
      stripMarker(trimmed, reviewProtocol.admission.marker),
      parsed,
    )
      ? { kind: 'invalid-formal-result' }
      : { kind: 'none' };
  }

  if (!trimmed.startsWith(reviewProtocol.event.marker)) {
    return isFormalResultCandidate(trimmed)
      ? { kind: 'invalid-formal-result' }
      : { kind: 'none' };
  }

  const parsed = parseMarkerJson(trimmed);

  if (!parsed) {
    return isFormalResultCandidate(
      stripMarker(trimmed, reviewProtocol.event.marker),
    )
      ? { kind: 'invalid-formal-result' }
      : { kind: 'none' };
  }

  const lifecycle = parseLifecycleEvent(parsed);

  if (lifecycle) {
    return { kind: 'lifecycle', value: lifecycle };
  }

  const judgment = parseJudgmentEvent(parsed);

  if (judgment) {
    return { kind: 'judgment', value: judgment };
  }

  return isJudgmentCandidateValue(parsed)
    ? { kind: 'invalid-formal-result' }
    : { kind: 'none' };
}

function parseMarkerJson(body: string): unknown | null {
  const [, ...rest] = body.split('\n');
  const jsonText = rest.join('\n').trim();

  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function parseAdmissionRecord(value: unknown): AdmissionRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const { reviewerNodeId, targetRepositoryId, repositoryName } = value;

  if (
    !isPositiveInteger(reviewerNodeId)
    || !isPositiveInteger(targetRepositoryId)
    || typeof repositoryName !== 'string'
  ) {
    return null;
  }

  if (!repositoryNamePattern.test(repositoryName)) {
    return null;
  }

  return { repositoryName, reviewerNodeId, targetRepositoryId };
}

function parseLifecycleEvent(value: unknown): LifecycleEvent | null {
  if (!isRecord(value) || !isLifecycleType(value.type)) {
    return null;
  }

  if (!hasRequiredFields(value, reviewProtocol.event.requiredLifecycleFields)) {
    return null;
  }

  const type = value.type;

  const {
    reviewerNodeId,
    targetRepositoryId,
    requestIssueNumber,
    eligibilityTargetCommit,
    reviewPolicyCommit,
    reason,
  } = value;

  if (
    !isPositiveInteger(reviewerNodeId)
    || !isPositiveInteger(targetRepositoryId)
    || !isPositiveInteger(requestIssueNumber)
  ) {
    return null;
  }

  if (
    !isCommit(eligibilityTargetCommit)
    || !isCommit(reviewPolicyCommit)
    || !isReReviewReason(reason)
  ) {
    return null;
  }

  const automationProvenance = parseAutomationProvenance(
    value.automationProvenance,
  );

  return {
    automationProvenance,
    eligibilityTargetCommit,
    reason,
    requestIssueNumber,
    reviewPolicyCommit,
    reviewerNodeId,
    targetRepositoryId,
    type,
  };
}

function parseJudgmentEvent(value: unknown): JudgmentEvent | null {
  if (!isRecord(value) || !isJudgmentType(value.type)) {
    return null;
  }

  const type = value.type;

  if (!hasRequiredFields(value, reviewProtocol.event.requiredJudgmentFields)) {
    return null;
  }

  const {
    actualStarState,
    reviewPolicyCommit,
    reviewPolicyPath,
    reviewedAt,
    reviewerNodeId,
    targetCommit,
    targetDefaultBranch,
    targetRepositoryFullName,
    targetRepositoryId,
    verdict,
  } = value;

  if (
    !isPositiveInteger(reviewerNodeId)
    || !isPositiveInteger(targetRepositoryId)
    || typeof actualStarState !== 'boolean'
  ) {
    return null;
  }

  if (
    !isCommit(targetCommit)
    || !isCommit(reviewPolicyCommit)
    || reviewPolicyPath !== reviewProtocol.event.policyPath
  ) {
    return null;
  }

  if (
    !isRepositoryFullName(targetRepositoryFullName)
    || typeof targetDefaultBranch !== 'string'
    || targetDefaultBranch.trim() === ''
  ) {
    return null;
  }

  if (
    !isVerdict(verdict)
    || !isRfc3339DateTime(reviewedAt)
    || !isJudgmentStarStateConsistent(type, verdict, actualStarState)
  ) {
    return null;
  }

  return {
    actualStarState,
    reviewPolicyCommit,
    reviewPolicyPath: reviewProtocol.event.policyPath,
    reviewedAt: String(reviewedAt),
    reviewerNodeId,
    targetCommit,
    targetDefaultBranch,
    targetRepositoryFullName,
    targetRepositoryId,
    type,
    verdict,
  };
}

function parseAutomationProvenance(
  value: unknown,
): AutomationProvenance | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (
    !hasRequiredFields(
      value,
      reviewProtocol.event.automation.requiredProvenanceFields,
    )
  ) {
    return null;
  }

  const {
    actorLogin,
    repositoryId,
    workflowPath,
    workflowCommit,
    workflowRunAttempt,
    workflowRunId,
  } = value;

  if (
    typeof actorLogin !== 'string'
    || !isPositiveInteger(repositoryId)
    || typeof workflowPath !== 'string'
    || !isCommit(workflowCommit)
    || !isPositiveInteger(workflowRunId)
    || !isPositiveInteger(workflowRunAttempt)
  ) {
    return null;
  }

  return {
    actorLogin,
    repositoryId,
    workflowCommit,
    workflowPath,
    workflowRunAttempt,
    workflowRunId,
  };
}

function hasRequiredFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => field in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && commitPattern.test(value);
}

function isRepositoryFullName(value: unknown): value is string {
  return (
    typeof value === 'string'
    && repositoryFullNamePattern.test(value)
  );
}

function isRfc3339DateTime(value: unknown): value is string {
  return (
    typeof value === 'string'
    && rfc3339Pattern.test(value)
    && !Number.isNaN(Date.parse(value))
  );
}

function isVerdict(value: unknown): value is ReviewVerdict {
  return value === 'PASS' || value === 'FAIL';
}

function isJudgmentType(value: unknown): value is JudgmentType {
  return (reviewProtocol.event.judgmentTypes as readonly string[]).includes(
    String(value),
  );
}

function isLifecycleType(value: unknown): value is LifecycleType {
  return (
    value === reviewProtocol.event.lifecycleType
    || value === 'STALE_DETECTED'
    || value === 'ENDORSEMENT_DRIFT'
  );
}

function isReReviewReason(value: unknown): value is ReReviewReason {
  return (
    value === 'TARGET_CHANGED'
    || value === 'POLICY_CHANGED'
    || value === 'TARGET_AND_POLICY_CHANGED'
  );
}

function stripMarker(body: string, marker: string): string {
  return body.slice(marker.length).trim();
}

function isFormalResultCandidate(body: string, parsed?: unknown): boolean {
  if (isJudgmentCandidateValue(parsed ?? parseLooseJson(body))) {
    return true;
  }

  return looksLikeStructuredFormalResultText(body);
}

function parseLooseJson(body: string): unknown | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isJudgmentCandidateValue(value: unknown): boolean {
  return Boolean(
    isRecord(value)
    && (
      isJudgmentType(value.type)
      || 'verdict' in value
      || 'actualStarState' in value
    ),
  );
}

function looksLikeStructuredFormalResultText(value: string): boolean {
  const normalized = value.trim();

  const firstLine = normalized
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return false;
  }

  if (/^Review Result:\s*(PASS|FAIL)\b/u.test(firstLine)) {
    return true;
  }

  if (
    (reviewProtocol.event.judgmentTypes as readonly string[]).includes(
      firstLine,
    )
  ) {
    return true;
  }

  return (
    normalized.startsWith('{')
    && /(?:^|[\n{,])\s*"(type|verdict|actualStarState)"\s*:/u.test(
      normalized,
    )
  );
}

function isJudgmentStarStateConsistent(
  type: JudgmentType,
  verdict: ReviewVerdict,
  actualStarState: boolean,
): boolean {
  if (actualStarState !== (verdict === 'PASS')) {
    return false;
  }

  if (type === 'RE_REVIEWED') {
    return verdict === 'PASS' && actualStarState;
  }

  if (type === 'STAR_REVOKED' || type === 'REVOKED_EXTERNALLY') {
    return verdict === 'FAIL' && !actualStarState;
  }

  return true;
}
