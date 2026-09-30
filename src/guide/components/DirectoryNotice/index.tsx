export default function DirectoryNotice({ eligibleCount }: { eligibleCount: number }) {
  return (
    <section className="directory wrap" aria-labelledby="directory-title">
      <div className="directory-icon" aria-hidden="true">
        <svg viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="46" className="directory-orbit" />
          <path
            d="M50 14 60 38 86 40 66 58 72 84 50 70 28 84 34 58 14 40 40 38Z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div>
        <p className="section-kicker">PUBLIC DIRECTORY</p>
        <h2 id="directory-title">Reviewer Directory</h2>
        <p data-count-group>
          <strong data-rolling-count>{eligibleCount}</strong>
          {' '}
          Eligible Reviewers
        </p>
        <p>
          Find people who publish Review Policies, inspect their public review
          context, and reach the surface where you can request evaluation.
        </p>
        <a className="text-link" href="/shoal-app/reviewers/">Browse Reviewers</a>
      </div>
    </section>
  );
}
