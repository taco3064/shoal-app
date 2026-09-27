import { reviewProtocol } from './contract';
import type {
  AdmissionRecord,
  JudgmentEvent,
  JudgmentType,
  LifecycleEvent,
  ParsedProtocolComment,
  ReReviewReason,
  RequestPayload,
  ReviewVerdict,
} from './types';

const commitPattern = /^[0-9a-f]{40}$/;
const repositoryNamePattern = /^[A-Za-z0-9_.-]+$/;
const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function getProtocolVersion(): number {
  return Number(reviewProtocol.protocolVersion);
}

export function parseRequestPayload(body: string): RequestPayload | null {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const repositoryHeading = `### ${reviewProtocol.request.repositoryHeading}`;
  const invitationHeading = `### ${reviewProtocol.request.invitationHeading}`;

  if (!normalized.startsWith(repositoryHeading)) {
    return null;
  }

  const rest = normalized.slice(repositoryHeading.length).trim();
  const invitationIndex = rest.indexOf(`\n${invitationHeading}`);

  const repositoryBlock
    = invitationIndex === -1 ? rest : rest.slice(0, invitationIndex).trim();

  const invitationBlock
    = invitationIndex === -1
      ? ''
      : rest.slice(invitationIndex + invitationHeading.length + 1).trim();

  const repositoryLines = repositoryBlock
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (
    repositoryLines.length !== 1
    || !repositoryNamePattern.test(repositoryLines[0])
  ) {
    return null;
  }

  if (
    repositoryLines[0].includes('/')
    || repositoryLines[0].startsWith('http')
  ) {
    return null;
  }

  if (invitationBlock.includes('\n### ')) {
    return null;
  }

  const invitationMessage
    = invitationBlock
      && invitationBlock !== reviewProtocol.request.emptyInvitation
      ? invitationBlock
      : null;

  return {
    invitationMessage,
    repositoryName: repositoryLines[0],
  };
}

export function parseProtocolComment(body: string): ParsedProtocolComment {
  const trimmed = body.trim();

  if (trimmed.startsWith(reviewProtocol.admission.marker)) {
    const parsed = parseMarkerJson(trimmed);
    const admission = parsed ? parseAdmissionRecord(parsed) : null;

    return admission
      ? { kind: 'admission', value: admission }
      : { kind: 'none' };
  }

  if (!trimmed.startsWith(reviewProtocol.event.marker)) {
    return { kind: 'none' };
  }

  const parsed = parseMarkerJson(trimmed);

  if (!parsed) {
    return looksLikeFormalResult(trimmed)
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

  return looksLikeFormalResult(JSON.stringify(parsed))
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
  if (!isRecord(value) || value.type !== reviewProtocol.event.lifecycleType) {
    return null;
  }

  if (!hasRequiredFields(value, reviewProtocol.event.requiredLifecycleFields)) {
    return null;
  }

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

  return {
    eligibilityTargetCommit,
    reason,
    requestIssueNumber,
    reviewPolicyCommit,
    reviewerNodeId,
    targetRepositoryId,
    type: reviewProtocol.event.lifecycleType,
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
    typeof targetRepositoryFullName !== 'string'
    || typeof targetDefaultBranch !== 'string'
  ) {
    return null;
  }

  if (!isVerdict(verdict) || !rfc3339Pattern.test(String(reviewedAt))) {
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

function isVerdict(value: unknown): value is ReviewVerdict {
  return value === 'PASS' || value === 'FAIL';
}

function isJudgmentType(value: unknown): value is JudgmentType {
  return (reviewProtocol.event.judgmentTypes as readonly string[]).includes(
    String(value),
  );
}

function isReReviewReason(value: unknown): value is ReReviewReason {
  return (
    value === 'TARGET_CHANGED'
    || value === 'POLICY_CHANGED'
    || value === 'TARGET_AND_POLICY_CHANGED'
  );
}

function looksLikeFormalResult(value: string): boolean {
  return /REVIEWED|RE_REVIEWED|STAR_REVOKED|REVOKED_EXTERNALLY|"verdict"|Review Result:/u.test(
    value,
  );
}
