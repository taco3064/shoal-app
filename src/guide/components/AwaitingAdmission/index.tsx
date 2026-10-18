export default function AwaitingAdmission(
  { observation, repositoryUrl, generatedAt }: {
    observation: { issueNumbers: number[] };
    repositoryUrl: string;
    generatedAt: string;
  },
) {
  return (
    <section className="detail-panel admission-panel" aria-labelledby="admission-title">
      <h2 id="admission-title">Awaiting Admission</h2>
      <dl className="admission-count">
        <div>
          <dt>Open Review Request candidates</dt>
          <dd>{observation.issueNumbers.length}</dd>
        </div>
      </dl>
      <p>
        Open, structurally recognizable Request candidates without valid initial
        Admission or initial Manual Review evidence. This observation does not
        establish Requester Membership, Target validity, self-review exclusion,
        duplicate admissibility, or a Reviewer obligation to review.
      </p>
      {observation.issueNumbers.length > 0 && (
        <ul className="admission-issues" aria-label="Candidate Issue evidence">
          {observation.issueNumbers.map((number) => (
            <li key={number}>
              <a href={`${repositoryUrl}/issues/${number}`}>
                {`Issue #${number}`}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="snapshot-note">
        Network Scan snapshot generated:
        {' '}
        <time dateTime={generatedAt}>{generatedAt}</time>
        .
        GitHub Issue state may have changed since this scan. This public observation
        is separate from formal Pending and Completed workload and is not attested
        by the Reviewer Summary. Do not add these independent snapshots together.
      </p>
    </section>
  );
}
