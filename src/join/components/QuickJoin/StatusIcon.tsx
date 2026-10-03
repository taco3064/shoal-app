type StageState
  = | 'available'
    | 'blocked'
    | 'complete'
    | 'current'
    | 'executing'
    | 'failed'
    | 'waiting';

export default function StatusIcon({ state }: { state: StageState }) {
  if (state === 'complete') {
    return (
      <svg viewBox="0 0 20 20" focusable="false">
        <path d="M5 10.4 8.5 14 15.5 6" />
      </svg>
    );
  }

  if (state === 'blocked') {
    return (
      <svg viewBox="0 0 20 20" focusable="false">
        <path d="M10 4v7" />
        <path d="M10 15h.01" />
      </svg>
    );
  }

  if (state === 'failed') {
    return (
      <svg viewBox="0 0 20 20" focusable="false">
        <path d="m6 6 8 8" />
        <path d="m14 6-8 8" />
      </svg>
    );
  }

  if (state === 'executing') {
    return (
      <svg viewBox="0 0 20 20" focusable="false">
        <path d="M10 4a6 6 0 1 1-5.2 3" />
        <path d="M4.5 4.5V8h3.5" />
      </svg>
    );
  }

  if (state === 'current' || state === 'available') {
    return (
      <svg viewBox="0 0 20 20" focusable="false">
        <circle cx="10" cy="10" r="3.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" focusable="false">
      <path d="M6.5 9V7.5a3.5 3.5 0 0 1 7 0V9" />
      <path d="M5.5 9h9v7h-9z" />
    </svg>
  );
}
