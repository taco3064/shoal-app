const steps = [
  {
    number: '01',
    title: 'Publish your policy',
    body: 'Fork the station and write down what earns your endorsement in its README.',
  },
  {
    number: '02',
    title: 'Review with evidence',
    body: 'Receive a request, review the repository against your policy, '
      + 'and record the result.',
  },
  {
    number: '03',
    title: 'Make the Star count',
    body: 'A passing review becomes a Star backed by a public decision '
      + 'and a specific version.',
  },
];

export default function Mechanism() {
  return (
    <>
      <section className="principle" aria-labelledby="principle-title">
        <div className="wrap principle-inner">
          <p className="section-kicker">THE IDEA</p>
          <h2 id="principle-title">
            From a popularity signal to a
            {' '}
            <span>reasoned endorsement.</span>
          </h2>
          <p>
            Each reviewer chooses their own standard. When a repository passes,
            the reviewer stars it and records the decision publicly. When the
            repository or policy changes, the endorsement can be reviewed again.
          </p>
        </div>
      </section>
      <section
        className="process wrap"
        id="how-it-works"
        aria-labelledby="process-title"
      >
        <div className="section-heading">
          <div>
            <p className="section-kicker">HOW IT WORKS</p>
            <h2 id="process-title">
              A visible path from
              <br />
              request to recognition.
            </h2>
          </div>
          <p>
            No universal score. No automatic background judgment. Each reviewer
            owns their policy and starts their own review.
          </p>
        </div>
        <div className="steps">
          {steps.map((step) => (
            <article className="step" key={step.number}>
              <span className="step-number">
                {step.number}
                {' '}
                / 03
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
