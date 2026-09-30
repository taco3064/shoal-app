import { useState } from 'react';

const forkPrompt = `I already directly forked taco3064/shoal-station into my personal account and manually enabled Actions on my fork's Actions page. Handle only mechanical setup:

Find/clone my fork. Check GitHub CLI and owner gh auth; guide official login if needed, but never request, collect, store, or reveal tokens. Install the official taco3064/gh-shoal extension. In a clean checkout run gh shoal init. Verify canonical managed files, active .github/workflows/reviewer-summary.yml, and enabled Issues. Do not change repository-level Actions policy or unrelated workflows; init cannot replace my manual Actions step.

Stop before README.md Review Policy. Do not write, rewrite, choose, or decide it. Tell me to author, commit, and push it myself.`;

export default function SetupPrompt() {
  const [copied, setCopied] = useState(false);
  const prompt = forkPrompt;
  const id = 'fork-setup-prompt';

  return (
    <div className="prompt-box">
      <label htmlFor={id}>Prompt for your local AI coding agent</label>
      <textarea id={id} readOnly rows={8} value={prompt} />
      <button
        type="button"
        className="button primary"
        onClick={async () => {
          await navigator.clipboard.writeText(prompt);
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy setup prompt'}
      </button>
    </div>
  );
}
