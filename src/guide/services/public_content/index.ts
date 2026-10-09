import type { ReviewerEntry } from '~app/network/services/network_projection';

export const publicExplanation = {
  title: 'Public information and its limits',
  paragraphs: [
    'Shoal is a public, policy-driven repository review network, not a '
    + 'Star exchange, pay-for-Star service, ranking or reputation score. '
    + 'A Requester asks for evaluation; each Reviewer owns their '
    + 'README.md Review Policy.',
    'PASS is a judgment against recorded Target and Policy commits. A '
    + 'review-backed Star also requires valid public Review evidence and '
    + 'the Reviewer’s actual GitHub Star. An ordinary Star alone is not '
    + 'review backing. Target or Policy changes can make an endorsement '
    + 'stale and permit Re-review.',
    'Public browsing needs no authentication or browser JavaScript. '
    + 'Reading a page, llms.txt or a text snapshot grants no permission '
    + 'to mutate repositories, Policies, Requests or Stars. Automation '
    + 'operates only under separately authorized Reviewer authority.',
    'The Directory, readiness and Summary are a published Network '
    + 'Projection, not live GitHub queries or assessments of Reviewer '
    + 'quality. Current means the latest completed qualifying Attempt '
    + 'was accepted at scan time; fallback is a stale prior accepted '
    + 'snapshot; unavailable has no selected metrics, not zero metrics. '
    + 'GitHub source facts and formal Protocol evidence retain their '
    + 'authority.',
  ],
};

export function reviewerDescription(reviewer: ReviewerEntry): string {
  const readiness = reviewer.stationStatus === 'ready'
    ? 'station ready at scan time'
    : 'station setup required at scan time';

  const summary = {
    current: 'accepted Summary snapshot',
    fallback: 'stale fallback Summary',
    unavailable: 'no accepted Summary metrics',
  }[reviewer.summary.status];

  // Only validated projection facts enter metadata, never external Policy/profile prose.
  return `${reviewer.username} — ${reviewer.repository}: ${readiness}; ${summary}. Read the Reviewer-owned Policy and source provenance.`;
}

export function reviewerSnapshot(
  reviewer: ReviewerEntry,
  generatedAt: string,
  canonicalUrl: string,
): string {
  const selected = reviewer.summary;

  const lines = [
    `# ${reviewer.username} — Shoal Reviewer published snapshot`,
    `Canonical HTML: ${canonicalUrl}`,
    `Projection generatedAt: ${generatedAt}`,
    `Reviewer Node Repository ID: ${reviewer.repositoryId}`,
    `Repository: ${reviewer.repository}`,
    `Station source: ${reviewer.repositoryUrl}`,
    `Public profile source: ${reviewer.profileUrl}`,
    `Reviewer-owned Policy source: ${reviewer.policyUrl}`,
    `Joined (repository created): ${reviewer.joinedAt}`,
    `Station readiness at scan time: ${reviewer.stationStatus}`,
    `Readiness reasons: ${reviewer.stationReadinessReasons.join(', ') || 'none'}`,
    `Accepted Summary selection: ${selected.status}`,
    `Stale fallback: ${selected.stale}`,
    '',
    ...publicExplanation.paragraphs,
  ];

  if (reviewer.stationStatus === 'ready') {
    lines.push(`Request Review: ${reviewer.repositoryUrl}/issues/new/choose`);
  }

  if (selected.status !== 'unavailable') {
    lines.push('', '## Selected accepted snapshot',
      `Selected Attempt runStartedAt: ${selected.source.runStartedAt}`,
      ...Object.entries(selected.summary.metrics).map(([key, value]) => `${key}: ${value}`),
      '## Accepted source provenance',
      ...Object.entries(selected.source).map(([key, value]) => `${key}: ${value}`));
  } else {
    lines.push('', 'No accepted Summary snapshot is selected; '
    + 'metrics and provenance are absent.');
  }

  return `${lines.join('\n')}\n`;
}
