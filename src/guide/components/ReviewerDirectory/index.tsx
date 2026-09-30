import TestReviewer from '../TestReviewer';
import useReviewerDirectory, {
  type DirectoryEntry,
} from '~app/guide/hooks/useReviewerDirectory';

export default function ReviewerDirectory(
  { reviewers }: { reviewers: DirectoryEntry[] },
) {
  const {
    entries, state, total, pageCount, update, pageUrl, navigatePage,
  } = useReviewerDirectory(reviewers);

  return (
    <section aria-label="Eligible Reviewers">
      <div className="directory-controls">
        <label>
          Search GitHub username
          <input
            value={state.username}
            onChange={(event) => update({ username: event.target.value })}
            type="search"
            placeholder="Search a Reviewer"
          />
        </label>
        <label>
          Sort by
          <select
            value={state.sortBy}
            onChange={(event) => update({
              sortBy: event.target.value as 'username' | 'joinedAt',
            })}
          >
            <option value="username">Username</option>
            <option value="joinedAt">Joined (repository created)</option>
          </select>
        </label>
        <button
          type="button"
          className="button sort-direction"
          onClick={() => update({ sortDir: state.sortDir === 'desc' ? 'asc' : 'desc' })}
          aria-label={`Sort ${state.sortDir === 'desc' ? 'descending' : 'ascending'}; change direction`}
        >
          {state.sortDir === 'desc' ? 'Descending ↓' : 'Ascending ↑'}
        </button>
      </div>
      <p className="directory-result-count" role="status">
        Showing
        {' '}
        {entries.length}
        {' '}
        of
        {' '}
        {total}
        {' '}
        eligible Reviewers
      </p>
      {entries.length === 0 && (
        <p role="status">No Reviewer found in the current eligible directory.</p>
      )}
      <div className="reviewer-grid">
        {entries.map((reviewer) => (
          <ReviewerCard key={reviewer.repositoryId} reviewer={reviewer} />
        ))}
      </div>
      {total > 0 && (
        <nav className="directory-pagination" aria-label="Reviewer pages">
          {state.page > 1
            ? (
                <a
                  className="text-link"
                  href={pageUrl(state.page - 1)}
                  onClick={(event) => navigatePage(event, state.page - 1)}
                >
                  Previous
                </a>
              )
            : (
                <span className="pagination-unavailable" aria-disabled="true">
                  Previous
                </span>
              )}
          <span role="status">
            Page
            {' '}
            {state.page}
            {' '}
            of
            {' '}
            {pageCount}
          </span>
          {state.page < pageCount
            ? (
                <a
                  className="text-link"
                  href={pageUrl(state.page + 1)}
                  onClick={(event) => navigatePage(event, state.page + 1)}
                >
                  Next
                </a>
              )
            : <span className="pagination-unavailable" aria-disabled="true">Next</span>}
        </nav>
      )}
    </section>
  );
}

function ReviewerCard({ reviewer }: { reviewer: DirectoryEntry }) {
  const detailUrl = `/shoal-app/reviewers/${encodeURIComponent(reviewer.username)}/`;
  const requestUrl = `${reviewer.repositoryUrl}/issues/new/choose`;

  return (
    <article className="reviewer-card">
      <a className="reviewer-card-body" href={detailUrl}>
        <div className="reviewer-card-head">
          <div className="reviewer-avatar">
            <img
              src={reviewer.avatarUrl}
              alt=""
              width="64"
              height="64"
              loading="lazy"
            />
            <TestReviewer username={reviewer.username} />
          </div>
          <div>
            <h2>
              {reviewer.username}
            </h2>
            <p>{reviewer.repository}</p>
          </div>
        </div>
        <div className="reviewer-card-meta">
          <p>
            Joined
            {' '}
            <time dateTime={reviewer.joinedAt}>
              {new Date(reviewer.joinedAt).toLocaleDateString('en-US', {
                timeZone: 'UTC',
              })}
            </time>
          </p>
          {reviewer.summary.status !== 'unavailable' && (
            <span className={`summary-state state-${reviewer.summary.status}`}>
              {reviewer.summary.status === 'fallback'
                ? 'Fallback · prior accepted snapshot'
                : 'Current summary'}
            </span>
          )}
        </div>
      </a>
      <footer className="reviewer-card-actions">
        <a
          className="button primary"
          href={requestUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Request review
        </a>
      </footer>
    </article>
  );
}
