export default function Hero() {
  return (
    <section className="hero wrap" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">
          <span className="pulse" />
          {' '}
          AN OPEN REVIEW NETWORK
        </p>
        <h1 id="hero-title">
          Make a GitHub Star
          {' '}
          <em>explainable.</em>
        </h1>
        <p className="lede">
          A Star can say more than “I like this.” Shoal connects it to a public
          review policy, a repository version, and the judgment behind it.
        </p>
        <div className="actions">
          <a
            className="text-link"
            href="/shoal-app/join/"
          >
            Join Shoal · set up your station
          </a>
          <a className="text-link" href="#how-it-works">
            See how it works
          </a>
        </div>
        <p className="hero-note">
          A review request is an invitation to evaluate, never a promise of a
          Star.
        </p>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="context-line context-line-one" />
        <div className="context-line context-line-two" />
        <div className="context-line context-line-three" />
        <div className="context-line context-line-four" />
        <div className="core-symbol">
          <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <path
              d="M50 8 62 37 94 40 70 61 77 92 50 75 23 92 30 61 6 40 38 37Z"
              stroke="currentColor"
              strokeWidth="3"
            />
          </svg>
          <span>EXPLAINED STAR</span>
        </div>
        <span className="art-label label-one">
          <span aria-hidden="true">👤</span>
          {' '}
          REVIEWER
        </span>
        <span className="art-label label-two">
          <span aria-hidden="true">📄</span>
          {' '}
          POLICY
        </span>
        <span className="art-label label-three">
          <span aria-hidden="true">🏷️</span>
          {' '}
          VERSION
        </span>
        <span className="art-label label-four">
          <span aria-hidden="true">🛡️</span>
          {' '}
          EVIDENCE
        </span>
      </div>
    </section>
  );
}
