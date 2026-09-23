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
            className="button primary"
            href="https://github.com/taco3064/shoal-station/fork"
          >
            Explore the station
            {' '}
            <span aria-hidden="true">↗</span>
          </a>
          <a className="button secondary" href="#how-it-works">
            See how it works
            {' '}
            <span aria-hidden="true">↓</span>
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
        <div className="orbit orbit-three" />
        <div className="core-symbol">✳</div>
        <span className="art-label label-one">POLICY</span>
        <span className="art-label label-two">EVIDENCE</span>
        <span className="art-label label-three">VERSION</span>
      </div>
    </section>
  );
}
