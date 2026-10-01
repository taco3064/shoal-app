import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  allowedSummaryWorkflows,
  summaryWorkflowPath,
} from '~app/protocol/services/network_compatibility';
import { validateReviewerSummary } from '~app/protocol/services/reviewer_summary_schema';
import type { ReviewerSummary } from '~app/protocol/services/reviewer_summary_schema';
import type {
  GitHubRepository,
  PublicSummary,
  WorkflowRun,
} from '../github_api';

const execFileAsync = promisify(execFile);

export type Attempt = WorkflowRun & { attempt: number };
export type SelectedSummary
  = | { status: 'unavailable'; stale: false }
    | {
      status: 'current' | 'fallback';
      stale: boolean;
      summary: ReviewerSummary;
      source: {
        runId: number;
        runAttempt: number;
        runStartedAt: string;
        workflowCommit: string;
        workflowDigest: string;
        actionCommit: string;
        transportUrl: string;
        summaryDigest: string;
        runUrl: string;
      };
    };

type SummaryRejectionReason
  = | 'execution-not-success'
    | 'invalid-head-sha'
    | 'head-repository-mismatch'
    | 'workflow-missing'
    | 'workflow-digest-unsupported'
    | 'public-transport-missing'
    | 'attestation-rejected'
    | 'summary-invalid-or-incompatible'
    | 'reviewer-node-id-mismatch';

type AcceptedAttempt = Extract<
  SelectedSummary,
  { status: 'current' | 'fallback' }
>;

type AttemptAcceptance
  = | { accepted: true; selected: AcceptedAttempt }
    | { accepted: false; reason: SummaryRejectionReason };

export interface SummarySource {
  runAttempt(
    fullName: string,
    runId: number,
    attempt: number,
  ): Promise<WorkflowRun>;
  publicSummary(
    fullName: string,
    repositoryId: number,
    runId: number,
    attempt: number,
  ): Promise<PublicSummary | null>;
  committedBytes(
    fullName: string,
    path: string,
    ref: string,
  ): Promise<Uint8Array | null>;
}

export type AttestationVerifier = (
  bytes: Uint8Array,
  fullName: string,
  commit: string,
  runId: number,
  attempt: number,
) => Promise<boolean>;

export async function verifyGitHubAttestation(
  bytes: Uint8Array,
  fullName: string,
  commit: string,
  runId: number,
  attempt: number,
): Promise<boolean> {
  const directory = await mkdtemp(join(tmpdir(), 'shoal-summary-'));
  const path = join(directory, 'reviewer-summary.json');

  try {
    await writeFile(path, bytes);

    const { stdout } = await execFileAsync(
      'gh',
      [
        'attestation',
        'verify',
        path,
        '--repo',
        fullName,
        '--signer-workflow',
        `${fullName}/${summaryWorkflowPath}`,
        '--source-digest',
        commit,
        '--signer-digest',
        commit,
        '--format',
        'json',
      ],
      { maxBuffer: 1024 * 1024 },
    );

    const verified = JSON.parse(stdout) as VerifiedAttestation[];
    const digest = hash(bytes);
    const invocation = `https://github.com/${fullName}/actions/runs/${runId}/attempts/${attempt}`;

    return hasMatchingProvenance(verified, digest, invocation);
  } catch (error) {
    if (isVerificationRejection(error)) {
      return false;
    }

    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type VerifiedAttestation = {
  verificationResult?: {
    statement?: { subject?: Array<{ digest?: { sha256?: string } }> };
    signature?: { certificate?: { runInvocationURI?: string } };
  };
};

export function hasMatchingProvenance(
  verified: VerifiedAttestation[],
  digest: string,
  invocation: string,
): boolean {
  return verified.some(
    (entry) =>
      entry.verificationResult?.signature?.certificate?.runInvocationURI
      === invocation
      && Boolean(
        entry.verificationResult?.statement?.subject?.some(
          (subject) => subject.digest?.sha256 === digest,
        ),
      ),
  );
}

function isVerificationRejection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('stderr' in error)) {
    return false;
  }

  const message = String(error.stderr);

  return /no attestations found|verification failed|failed to verify|no matching attestations/i.test(
    message,
  );
}

export function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function qualifies(run: WorkflowRun, repositoryId: number): boolean {
  return (
    run.repository?.id === repositoryId && run.path === summaryWorkflowPath
  );
}

export function orderAttempts(a: Attempt, b: Attempt): number {
  return (
    b.run_started_at.localeCompare(a.run_started_at)
    || b.id - a.id
    || b.attempt - a.attempt
  );
}

export async function selectSummary(
  node: GitHubRepository,
  runs: WorkflowRun[],
  source: SummarySource,
  verifier: AttestationVerifier,
): Promise<SelectedSummary> {
  const attempts: Attempt[] = [];

  for (const run of runs.filter((candidate) => qualifies(candidate, node.id))) {
    if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
      throw new Error('Invalid GitHub run_attempt.');
    }

    for (let number = 1; number <= run.run_attempt; number += 1) {
      const detail
        = number === run.run_attempt
          ? run
          : await source.runAttempt(node.full_name, run.id, number);

      if (!qualifies(detail, node.id) || detail.id !== run.id) {
        throw new Error('Attempt identity changed during enumeration.');
      }

      attempts.push({ ...detail, attempt: number });
    }
  }

  const completed = attempts.filter(
    (attempt) => attempt.status === 'completed',
  );

  completed.sort(orderAttempts);

  for (const [index, attempt] of completed.entries()) {
    const accepted = await acceptAttempt(node, attempt, source, verifier);

    if (accepted.accepted) {
      logSummaryDecision(
        node,
        attempt,
        index === 0 ? 'selected-current' : 'selected-fallback',
      );

      return {
        ...accepted.selected,
        status: index === 0 ? 'current' : 'fallback',
        stale: index !== 0,
      };
    }

    logSummaryDecision(node, attempt, accepted.reason);
  }

  if (completed.length > 0) {
    logSummaryDecision(node, completed[0], 'selected-unavailable');
  }

  return { status: 'unavailable', stale: false };
}

async function acceptAttempt(
  node: GitHubRepository,
  attempt: Attempt,
  source: SummarySource,
  verifier: AttestationVerifier,
): Promise<AttemptAcceptance> {
  if (attempt.conclusion !== 'success') {
    return rejectAttempt('execution-not-success');
  }

  if (!/^[a-f0-9]{40}$/.test(attempt.head_sha)) {
    return rejectAttempt('invalid-head-sha');
  }

  if (attempt.head_repository?.id !== node.id) {
    return rejectAttempt('head-repository-mismatch');
  }

  const workflowBytes = await source.committedBytes(
    node.full_name,
    summaryWorkflowPath,
    attempt.head_sha,
  );

  if (!workflowBytes) {
    return rejectAttempt('workflow-missing');
  }

  const workflowDigest = hash(workflowBytes);
  const trust = allowedSummaryWorkflows.get(workflowDigest);

  if (!trust) {
    return rejectAttempt('workflow-digest-unsupported');
  }

  const transport = await source.publicSummary(
    node.full_name,
    node.id,
    attempt.id,
    attempt.attempt,
  );

  if (!transport) {
    return rejectAttempt('public-transport-missing');
  }

  const { bytes } = transport;
  const summaryDigest = hash(bytes);

  if (
    !(await verifier(
      bytes,
      node.full_name,
      attempt.head_sha,
      attempt.id,
      attempt.attempt,
    ))
  ) {
    return rejectAttempt('attestation-rejected');
  }

  let summary: ReviewerSummary;

  try {
    summary = validateReviewerSummary(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      trust.reviewerSummary,
    );
  } catch (error) {
    // Invalid public data rejects the Attempt; required API failures remain fatal.
    if (error instanceof Error) {
      return rejectAttempt('summary-invalid-or-incompatible');
    }

    throw error;
  }

  if (summary.reviewerNode.repositoryId !== node.id) {
    return rejectAttempt('reviewer-node-id-mismatch');
  }

  return {
    accepted: true,
    selected: {
      status: 'current',
      stale: false,
      summary,
      source: {
        runId: attempt.id,
        runAttempt: attempt.attempt,
        runStartedAt: attempt.run_started_at,
        workflowCommit: attempt.head_sha,
        workflowDigest,
        actionCommit: trust.actionCommit,
        transportUrl: transport.url,
        summaryDigest,
        runUrl: attempt.html_url,
      },
    },
  };
}

function rejectAttempt(reason: SummaryRejectionReason): AttemptAcceptance {
  return { accepted: false, reason };
}

function logSummaryDecision(
  node: GitHubRepository,
  attempt: Attempt,
  reason: SummaryRejectionReason
    | 'selected-current'
    | 'selected-fallback'
    | 'selected-unavailable',
): void {
  if (process.env.SHOAL_SCAN_DIAGNOSTICS !== '1') {
    return;
  }

  console.info(
    [
      'Reviewer Summary decision',
      `reviewer=${node.full_name}`,
      `repositoryId=${node.id}`,
      `run=${attempt.id}`,
      `attempt=${attempt.attempt}`,
      `reason=${reason}`,
    ].join(' '),
  );
}
