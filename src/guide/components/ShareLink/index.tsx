import { useState } from 'react';

export default function ShareLink() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <button className="share-link" type="button" onClick={copyLink}>
      {copied ? 'Link copied' : 'Copy page link'}
    </button>
  );
}
