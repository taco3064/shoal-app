import { useState } from 'react';

const prompt = `I have already directly forked https://github.com/taco3064/shoal-station into my personal GitHub account and personally completed the GitHub Actions page manual enable / confirmation in my fork. Help with only the remaining mechanical Shoal setup.

Locate my direct Reviewer Node fork or help me clone it. Check that GitHub CLI is available and that gh auth is usable as the Reviewer Node owner. If authentication requires interaction, guide me through the official gh auth flow; never ask for, collect, save, print, or transmit credentials or tokens. Ensure the official extension from https://github.com/taco3064/gh-shoal is installed, then run gh shoal init in a clean Reviewer Node checkout. Verify its managed station files are canonical, only the canonical .github/workflows/reviewer-summary.yml workflow is active, and Reviewer Node Issues are enabled. Do not enable unrelated workflows or change repository-level Actions policy.

Stop before Review Policy authorship. Do not author, rewrite, choose, or decide anything in my README.md Review Policy. Hand control back to me so I personally define that policy, commit it, and push it. Report any blocker without claiming that gh shoal init replaces my earlier GitHub Actions page step.`;

export default function SetupPrompt() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="prompt-box">
      <label htmlFor="setup-prompt">Prompt for your local AI coding agent</label>
      <textarea id="setup-prompt" readOnly rows={14} value={prompt} />
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
