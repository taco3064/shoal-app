// Explicit official versions, never live trust-on-first-use discovery.
// Update only after the canonical station files and Action release have been reviewed.
export const networkRoot = {
  fullName: 'taco3064/shoal-station',
  repositoryId: 1379044983,
} as const;

export const summaryWorkflowPath = '.github/workflows/reviewer-summary.yml';
export const requestFormPath = '.github/ISSUE_TEMPLATE/review-request.yml';

// Public Git transport: one attempt-addressable tag per Summary Attempt.
export function summaryTransportTag(
  repositoryId: number,
  runId: number,
  attempt: number,
): string {
  return `shoal-summary-${repositoryId}-${runId}-${attempt}`;
}

export const allowedCanonicalReviewRequestFormDigests = new Set([
  '6f5dad1fd33ec1ea077eb30e866ef8dcf4d9d840239701b997781418da6c7f2c',
]);

// Each trusted workflow's exact bytes bind to a pinned official Action.
export const allowedSummaryWorkflows = new Map([
  [
    '616eea6f7ce06c0991f0023768c02c79a99d53aeb2f845c0934461720546a999',
    'b4d72405ebc03afc35d29093302b5593e1ddff1b',
  ],
  [
    // shoal-station 1d329860: attempt-addressable public transport, same pinned Action.
    'd586ab618c894d9729e21d7105becb0ca805df576198353293b1f77818927e99',
    'b4d72405ebc03afc35d29093302b5593e1ddff1b',
  ],
]);
