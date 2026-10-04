import type { DirectoryEntry } from '~app/guide/hooks/useReviewerDirectory';

export default function ReviewerWorkload(
  { selected, explainAbsence = false }: {
    selected: DirectoryEntry['summary'];
    explainAbsence?: boolean;
  },
) {
  if (selected.status === 'unavailable') {
    return null;
  }

  if (selected.summary.summarySchemaVersion === 1) {
    return explainAbsence
      ? (
          <p className="workload-absence">
            Workload facts are not available from this accepted Summary generation.
            Pending and Completed are absent, not zero.
          </p>
        )
      : null;
  }

  const {
    pendingReviewRequestCount, completedReviewRequestCount,
  } = selected.summary.metrics;

  return (
    <div className="reviewer-workload" data-freshness={selected.status}>
      <p className="workload-snapshot">
        {selected.status === 'fallback'
          ? 'Prior accepted workload · stale'
          : 'Selected accepted workload'}
      </p>
      <dl className="workload-grid" aria-label="Review request workload">
        <div>
          <dt>Pending</dt>
          <dd>{pendingReviewRequestCount}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{completedReviewRequestCount}</dd>
        </div>
      </dl>
      {explainAbsence && (
        <p className="workload-explanation">
          Valid review and re-review work awaiting or reaching lifecycle completion.
          Completed work includes PASS, FAIL, and valid resolution without a new
          judgment; it does not count endorsements or rate this Reviewer.
        </p>
      )}
    </div>
  );
}
