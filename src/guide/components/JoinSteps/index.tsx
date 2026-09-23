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
        Directly fork the Network Root, open your fork’s GitHub Actions page and
        complete its manual enable step. Then clone the fork, install the gh
        extension, run
        {' '}
        <code>gh shoal init</code>
        , and write your review policy
        in the README.
      </p>
      <a
        className="button primary"
        href="https://github.com/taco3064/shoal-station"
      >
        Visit the Network Root
        {' '}
        <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
