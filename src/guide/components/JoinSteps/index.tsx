export default function JoinSteps() {
  return (
    <section className="join wrap" aria-labelledby="join-title">
      <p className="section-kicker">START A STATION</p>
      <h2 id="join-title">
        Your standards.
        <br />
        <em>Your signature.</em>
      </h2>
      <p>
        If you own the Network Root, it is your Reviewer Node. Otherwise,
        directly fork it, complete the manual Actions confirmation in your
        fork, then install the gh extension, run
        {' '}
        <code>gh shoal init</code>
        {' '}
        on your fork. In either path, write your own Review Policy in the README.
      </p>
      <a
        className="button primary"
        href="/shoal-app/join/"
      >
        Join Shoal · full setup guide
        {' '}
        <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
