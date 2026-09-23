export default function DirectoryNotice() {
  return (
    <section className="directory wrap" aria-labelledby="directory-title">
      <div className="directory-icon" aria-hidden="true">
        ↗
      </div>
      <div>
        <p className="section-kicker">COMING LATER</p>
        <h2 id="directory-title">Reviewer Directory</h2>
        <p>
          The public directory is not available yet. Reviewer lookup and network
          data will arrive in a later milestone; there is no live search here
          today.
        </p>
      </div>
    </section>
  );
}
