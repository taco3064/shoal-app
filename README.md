# Shoal platform

Shoal makes a GitHub Star explainable: a reviewer publishes their own policy, reviews a repository against a specific commit, and records the decision. A PASS can become a review-backed Star. The [public website](https://taco3064.github.io/shoal-app/) currently explains the mechanism; the Reviewer Directory is planned and no lookup is live yet.

This repository owns the platform website and, in later milestones, shared protocol and schemas, Marketplace Action source, Network Aggregator, and Network Scan. It is one npm package. It does not own the [`gh-shoal`](https://github.com/taco3064/gh-shoal) extension runtime, the [`shoal-station`](https://github.com/taco3064/shoal-station) Network Root and reviewer policy, or the [`shoal-action`](https://github.com/taco3064/shoal-action) distribution surface.

## Local development

Use Node.js 24 and npm:

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run build
npm run blueprint:validate
```

Astro owns static routing, layouts, metadata, and HTML composition under `src/app/`. The `guide` Blueprint module owns the product explanation and joining guidance rendered as static React HTML; only the share button is an interactive island. Blueprint's Module First topology governs supported TS/TSX source; `.astro` files are framework composition and checked by ESLint with the Astro parser, not claimed as Blueprint-governed source. Domain and protocol logic belongs in governed modules, not in `.astro` files. The `network` module builds the Network Projection candidate; the directory website is a later milestone.

Husky installs with `npm ci`. Pre-commit formats and lints staged source and checks types; pre-push builds the site. Pull request CI runs lint, type checking, build, and Blueprint checks on Ubuntu and Windows. A successful `main` verification triggers the GitHub Pages deployment workflow. GitHub Pages must be configured with **GitHub Actions** as its build and deployment source in repository settings.

## Joining Shoal

Directly fork the [Network Root](https://github.com/taco3064/shoal-station). Open the fork's **GitHub Actions** page and complete GitHub's manual enable / confirmation. Then clone the fork, install the `gh-shoal` extension, run `gh shoal init`, and edit your fork's `README.md` to write your own review policy. `gh shoal init` cannot replace the manual Actions step.

## Network Projection candidate

The weekly `Network Scan` workflow and `workflow_dispatch` enumerate the canonical
Network Root's direct forks, check current Directory eligibility, and verify each
eligible node's Reviewer Summary attempts. The selected state is `current`, stale
`fallback`, or `unavailable`. The workflow uploads a validated
`network-projection-candidate` artifact only after the full rebuild succeeds. It
never updates the live Pages data; publication belongs to issue #9.

The public Summary transport is one public GitHub Release per Attempt in the
Reviewer Node repository. Its tag is
`shoal-summary-<repository-id>-<workflow-run-id>-<run-attempt>` and its sole
Summary asset is `reviewer-summary.json`. The canonical Summary Workflow must
publish the **unchanged attested bytes** with the workflow's GitHub Actions bot;
the Aggregator requires the release author and asset uploader to be that bot.
Each attempt has a separate tag, including reruns of the same workflow run. The
Aggregator fetches these public bytes without a cross-repository Actions artifact
token, then verifies the attestation subject's byte digest and certificate run
invocation, the exact allowed workflow digest and pinned Action commit, and the
Summary schema and Protocol version. The Actions artifact remains archival
evidence. Publication in the canonical station workflow is a separate dependency
and is outside issue #8; nodes without a published accepted Summary are
`unavailable` until that workflow is updated and its exact new digest is reviewed
for the compatibility allowlist.

For a local scan, set `GITHUB_TOKEN` to a read-capable GitHub token and run
`npm run scan:network`. The GitHub CLI must be installed for cryptographic
attestation verification. The result is `dist/network-projection/network.json`.
Run `npm run test:network` for focused trust and failure-path checks.

Official managed-file digests and pinned Action commits are listed explicitly in
`src/protocol/services/network_compatibility`. A new station or Action version
requires an intentional compatibility review and update; the scanner never
trusts the latest mutable branch by default.
