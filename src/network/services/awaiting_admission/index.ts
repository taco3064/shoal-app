import {
  parseProtocolComment,
  parseRequestPayload,
} from '~app/protocol/services/review_protocol';
import type {
  AdmissionRecord,
  ParsedProtocolComment,
} from '~app/protocol/services/review_protocol';
import type { GitHubRepository } from '../github_api';

type Issue = {
  number: number;
  state: string;
  body: string | null;
  url: string;
  user: { id: number; login: string; type: string };
  pull_request?: unknown;
};

type Comment = {
  id: number;
  body: string;
  url: string;
  created_at: string;
  issue_url: string;
  user: { id: number; login: string; type: string };
};

type IntakeSource = {
  pages<T>(path: string, key?: string): Promise<T[]>;
  json<T>(path: string): Promise<T>;
};

export type AwaitingAdmission = { issueNumbers: number[] };

export async function observeAwaitingAdmission(
  source: IntakeSource,
  node: GitHubRepository,
): Promise<AwaitingAdmission> {
  if (!Number.isSafeInteger(node.owner.id) || node.owner.id <= 0) {
    throw new Error('Invalid Reviewer owner identity for intake observation.');
  }

  const issues = await source.pages<Issue>(
    `/repos/${node.full_name}/issues?state=open&sort=created&direction=asc`,
  );

  const issueNumbers = new Set<number>();

  for (const issue of issues) {
    validateIssue(issue, node.full_name);

    if (issue.pull_request || issue.state !== 'open'
      || issue.body === null || !parseRequestPayload(issue.body)) {
      continue;
    }

    const comments = await source.pages<Comment>(
      `/repos/${node.full_name}/issues/${issue.number}/comments`,
    );

    for (const comment of comments) {
      validateComment(comment, issue.url);
    }

    if (!await hasInitialEvidence(source, { node, issue, comments })) {
      issueNumbers.add(issue.number);
    }
  }

  return { issueNumbers: [...issueNumbers].sort((left, right) => left - right) };
}

async function hasInitialEvidence(
  source: IntakeSource,
  { node, issue, comments }: {
    node: GitHubRepository; issue: Issue; comments: Comment[];
  },
): Promise<boolean> {
  const evidence = comments
    .filter((comment) => comment.user.id === node.owner.id)
    .sort((left, right) =>
      Date.parse(left.created_at) - Date.parse(right.created_at)
      || left.id - right.id)
    .map((comment) => parseProtocolComment(comment.body));

  const admissions = evidence
    .filter((parsed) => parsed.kind === 'admission')
    .map((parsed) => parsed.value);

  if (admissions.length > 0) {
    const first = admissions[0];

    return first.reviewerNodeId === node.id
      && admissions.every((record) => sameAdmission(record, first));
  }

  const targetIds = initialManualTargets(evidence, node);

  if (targetIds.size === 0) {
    return false;
  }

  return matchesCurrentTarget(source, issue, targetIds);
}

function sameAdmission(left: AdmissionRecord, right: AdmissionRecord): boolean {
  return left.reviewerNodeId === right.reviewerNodeId
    && left.targetRepositoryId === right.targetRepositoryId
    && left.repositoryName.toLowerCase() === right.repositoryName.toLowerCase();
}

function initialManualTargets(
  evidence: ParsedProtocolComment[],
  node: GitHubRepository,
): Set<number> {
  const validTargets = new Set<number>();
  const priorInitialTargets = new Set<unknown>();
  let unidentifiedPriorInitial = false;

  for (const parsed of evidence) {
    if (parsed.kind === 'invalid-formal-result') {
      const initial = parsed.initialReviewEvidence;

      if (initial && (initial.reviewerNodeId === undefined
        || initial.reviewerNodeId === node.id)) {
        if (initial.targetRepositoryId === undefined) {
          unidentifiedPriorInitial = true;
        } else {
          priorInitialTargets.add(initial.targetRepositoryId);
        }
      }
    }

    if (parsed.kind !== 'judgment' || parsed.value.type !== 'REVIEWED'
      || parsed.value.reviewerNodeId !== node.id) {
      continue;
    }

    const judgment = parsed.value;

    const priorInitial = unidentifiedPriorInitial
      || priorInitialTargets.has(judgment.targetRepositoryId);

    priorInitialTargets.add(judgment.targetRepositoryId);

    if (!priorInitial) {
      validTargets.add(judgment.targetRepositoryId);
    }
  }

  return validTargets;
}

async function matchesCurrentTarget(
  source: IntakeSource,
  issue: Issue,
  targetIds: Set<number>,
): Promise<boolean> {
  const request = parseRequestPayload(issue.body ?? '');

  if (!request) {
    throw new Error('Missing recognizable Request for Manual Review identity.');
  }

  const target = await source.json<{ id: number; owner: { id: number } }>(
    `/repos/${encodeURIComponent(issue.user.login)}/${encodeURIComponent(request.repositoryName)}`,
  );

  if (!target || !Number.isSafeInteger(target.id) || target.id <= 0
    || !target.owner || !Number.isSafeInteger(target.owner.id)
    || target.owner.id <= 0) {
    throw new Error('Invalid public Manual Review Target identity.');
  }

  return target.owner.id === issue.user.id && targetIds.has(target.id);
}

function validateIssue(issue: Issue, repository: string): void {
  if (!issue || !Number.isSafeInteger(issue.number) || issue.number <= 0
    || !['open', 'closed'].includes(issue.state)
    || (issue.body !== null && typeof issue.body !== 'string')
    || !isUser(issue.user)
    || issue.url !== `https://api.github.com/repos/${repository}/issues/${issue.number}`) {
    throw new Error('Invalid public Issue observation.');
  }
}

function validateComment(comment: Comment, issueUrl: string): void {
  const prefix = issueUrl.slice(0, issueUrl.lastIndexOf('/issues/'));

  if (!comment || !Number.isSafeInteger(comment.id) || comment.id <= 0
    || typeof comment.body !== 'string' || !isUser(comment.user)
    || Number.isNaN(Date.parse(comment.created_at))
    || comment.issue_url !== issueUrl
    || comment.url !== `${prefix}/issues/comments/${comment.id}`) {
    throw new Error('Invalid public Issue comment observation.');
  }
}

function isUser(user: Issue['user']): boolean {
  return Boolean(user && Number.isSafeInteger(user.id) && user.id > 0
    && typeof user.login === 'string' && user.login.trim().length > 0
    && typeof user.type === 'string');
}

export function validateAwaitingAdmission(value: AwaitingAdmission): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => key !== 'issueNumbers')
    || !Array.isArray(value.issueNumbers)
    || value.issueNumbers.some((number, index, numbers) =>
      !Number.isSafeInteger(number) || number <= 0
      || (index > 0 && number <= numbers[index - 1]))) {
    throw new Error('Invalid Awaiting Admission Issue identifiers.');
  }
}
