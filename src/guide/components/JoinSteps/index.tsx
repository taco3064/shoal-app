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
        Directly fork the Shoal station template and follow the shared Join
        stages with Web-assisted setup or Local / CLI instructions. Publish
        your own Review Policy in the README. Website authorization is optional;
        local setup remains available through
        {' '}
        <code>gh shoal init</code>
        .
      </p>
      <a
        className="text-link"
        href="/shoal-app/join/"
      >
        Join Shoal · full setup guide
      </a>
    </section>
  );
}
