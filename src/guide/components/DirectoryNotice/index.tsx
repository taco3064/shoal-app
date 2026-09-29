export default function DirectoryNotice() {
  return (
    <section className="directory wrap" aria-labelledby="directory-title">
      <div className="directory-icon" aria-hidden="true">
        ↗
      </div>
      <div>
        <p className="section-kicker">PUBLIC DIRECTORY</p>
        <h2 id="directory-title">Reviewer Directory</h2>
        <p>
          Explore eligible Reviewers in the latest complete public Network Projection.
        </p>
        <a href="/shoal-app/reviewers/">Browse Reviewers →</a>
      </div>
    </section>
  );
}
