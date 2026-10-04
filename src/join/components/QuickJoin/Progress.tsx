import type useQuickJoin from '~app/join/hooks/useQuickJoin';

type JoinState = ReturnType<typeof useQuickJoin>;

export default function Progress({ join }: { join: JoinState }) {
  const job = join.job!;

  if (job.status === 'complete' && job.progress.total === 0) {
    return null;
  }

  return (
    <section
      className="quick-progress"
      aria-labelledby="quick-progress-title"
      aria-live="polite"
    >
      <h3 id="quick-progress-title">
        Setup progress ·
        {' '}
        {job.status}
      </h3>
      <progress
        value={job.progress.completed}
        max={Math.max(1, job.progress.total)}
        aria-label="Verified operations"
      />
      <p>
        {job.progress.completed}
        {' '}
        /
        {job.progress.total}
        {' '}
        operations verified
      </p>
      {job.progress.currentOperation && (
        <p>
          Running:
          {' '}
          {job.progress.currentOperation.replaceAll('_', ' ')}
        </p>
      )}
      <ol>
        {job.progress.operations?.map((operation) => (
          <li key={operation.name}>
            {operation.name.replaceAll('_', ' ')}
            :
            {' '}
            {operation.state}
            {operation.error && <p>{operation.error}</p>}
          </li>
        ))}
        {!job.progress.operations
          && job.progress.verifiedOperations.map((operation) => (
            <li key={operation}>
              Verified:
              {' '}
              {operation.replaceAll('_', ' ')}
            </li>
          ))}
      </ol>
      <p>
        Progress advances only after GitHub read-back verifies each operation.
      </p>
      {(job.status === 'failed' || job.status === 'blocked') && (
        <p>
          Completed work is preserved. Progress is frozen at the last verified
          operation. Refresh to inspect and retry only remaining work.
        </p>
      )}
    </section>
  );
}
