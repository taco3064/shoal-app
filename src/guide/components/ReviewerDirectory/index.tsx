import { useMemo, useState } from 'react';
type Entry = {
  repositoryId: number;
  username: string;
  repository: string;
  joinedAt: string;
  avatarUrl: string;
  summary: { status: 'current' | 'fallback' | 'unavailable' };
};

export default function ReviewerDirectory({ reviewers }: { reviewers: Entry[] }) {
  const [query, setQuery] = useState('');
  const [key, setKey] = useState<'username' | 'joinedAt'>('username');
  const [descending, setDescending] = useState(false);

  const entries = useMemo(() => {
    const filtered = reviewers.filter((reviewer) => reviewer.username
      .toLowerCase().includes(query.trim().toLowerCase()));

    const direction = descending ? -1 : 1;

    return filtered.sort((a, b) => {
      const comparison = key === 'username'
        ? a.username.toLowerCase().localeCompare(b.username.toLowerCase(), 'en')
        : a.joinedAt.localeCompare(b.joinedAt);

      return direction * (comparison || a.repositoryId - b.repositoryId);
    });
  }, [reviewers, query, key, descending]);

  if (reviewers.length === 0) {
    return (
      <section aria-label="Eligible Reviewers">
        <p role="status">
          No eligible Reviewers are present in this projection. Search becomes
          available when a complete projection contains participants.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Eligible Reviewers">
      <div className="directory-controls">
        <label>
          Search GitHub username
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Search a Reviewer"
          />
        </label>
        <label>
          Sort by
          <select
            value={key}
            onChange={(event) => setKey(event.target.value as 'username' | 'joinedAt')}
          >
            <option value="username">Username</option>
            <option value="joinedAt">Joined (repository created)</option>
          </select>
        </label>
        <button
          type="button"
          className="sort-direction"
          onClick={() => setDescending((value) => !value)}
          aria-label={`Sort ${descending ? 'descending' : 'ascending'}; change direction`}
        >
          {descending ? 'Descending ↓' : 'Ascending ↑'}
        </button>
      </div>
      <p className="directory-result-count" role="status">
        Showing
        {' '}
        {entries.length}
        {' '}
        of
        {' '}
        {reviewers.length}
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
    </section>
  );
}

function ReviewerCard({ reviewer }: { reviewer: Entry }) {
  return (
    <article className="reviewer-card">
      <div className="reviewer-card-head">
        <img
          src={reviewer.avatarUrl}
          alt=""
          width="64"
          height="64"
          loading="lazy"
        />
        <div>
          <h2>
            <a href={`/shoal-app/reviewers/${encodeURIComponent(reviewer.username)}/`}>
              {reviewer.username}
            </a>
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
        <span className={`summary-state state-${reviewer.summary.status}`}>
          {reviewer.summary.status === 'fallback'
            ? 'Fallback · prior accepted snapshot'
            : reviewer.summary.status}
        </span>
      </div>
    </article>
  );
}
