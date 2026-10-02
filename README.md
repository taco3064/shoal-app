# Shoal platform

<p>
  <img src="public/shoal-logo.webp" alt="Shoal logo" width="360" />
</p>

Shoal makes a GitHub Star explainable: a reviewer publishes their own policy, reviews a repository against a specific commit, and records the decision. A PASS can become a review-backed Star. The [public website](https://taco3064.github.io/shoal-app/) explains the mechanism and publishes the Reviewer Directory from the latest successfully deployed Network Projection.

This repository owns the platform website, shared protocol and schemas, Marketplace Action source, Network Aggregator, and Network Scan. It is one npm package. It does not own the [`gh-shoal`](https://github.com/taco3064/gh-shoal) extension runtime, the [`shoal-station`](https://github.com/taco3064/shoal-station) Network Root and reviewer policy, or the [`shoal-action`](https://github.com/taco3064/shoal-action) distribution surface.

Product delivery records are published through
[GitHub Releases](https://github.com/taco3064/shoal-app/releases). They reconstruct
the delivered system and its evidence; the Product BR remains current product
authority.

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

Astro owns static routing, layouts, metadata, and HTML composition under `src/app/`. The `guide` Blueprint module owns product explanation, joining guidance, and directory presentation. Blueprint's Module First topology governs supported TS/TSX source; `.astro` files are framework composition and checked by ESLint with the Astro parser, not claimed as Blueprint-governed source. Domain and protocol logic belongs in governed modules, not in `.astro` files. The `network` module builds the Network Projection candidate.

Husky installs with `npm ci`. Pre-commit uses ESLint to fix staged source and checks types; pre-push builds the site. Pull request CI runs lint, type checking, build, tests, and Blueprint checks on Ubuntu and Windows; Ubuntu also scans the public Network and preserves the resulting projection artifact for review. A successful `main` verification triggers Network Scan and Pages publication. GitHub Pages must be configured with **GitHub Actions** as its build and deployment source in repository settings.

## Joining Shoal

The [Join page](https://taco3064.github.io/shoal-app/join/) keeps public browsing
unauthenticated and offers optional Quick Web Join alongside Local / CLI Join.
Quick Web Join uses a Cloudflare Worker with SQLite Durable Object state and a
GitHub App to inspect the
Reviewer's direct fork and execute only explicitly confirmed remaining setup.
Policy changes require their own confirmation. Configure and deploy the service
using [the operating guide](docs/quick-web-join.md); the static Pages site never
holds GitHub mutation credentials. Until that external bootstrap is complete,
the Local / CLI path remains available.

For Local / CLI Join, directly fork the
[Network Root](https://github.com/taco3064/shoal-station), manually enable Actions
in the fork, then use `gh shoal init` for the managed station setup. Each Reviewer
authors their own `README.md` Review Policy. `gh shoal init` cannot replace the
manual Actions step for a new fork. The Personal Account-owned Network Root is
also its owner's valid Reviewer Node; Root bootstrap and maintenance are an
internal maintainer path, separate from public onboarding.

## Network Scan and publication

The scheduled, manually dispatched, and successful `main` Verify-triggered
`Network Scan` workflow evaluates the personal-account Network Root and its
direct personal-account forks. Every Membership-valid node remains in the
Directory. Station readiness is evaluated independently as `ready` or
`setup_required`; setup requirements do not remove a valid participant. The scan
also verifies each participant's Reviewer Summary attempts independently of
readiness. The selected Summary state is `current`, stale
`fallback`, or `unavailable`. A successful production scan uses that complete
validated projection to build and deploy GitHub Pages. A failed scan or build
does not replace the previous good website. Pull request Verify performs a scan
for review evidence but does not publish the site.

The canonical Summary Workflow publishes each Attempt's **unchanged attested
bytes** as `reviewer-summary.json` in a separate parentless Git commit, addressed
by `shoal-summary-<repository-id>-<workflow-run-id>-<run-attempt>`. The public
retrieval URL is
`https://raw.githubusercontent.com/<owner>/<repo>/<tag>/reviewer-summary.json`.
Reruns receive their own tags. The Aggregator constructs this exact URL and
fetches bytes anonymously, without a cross-repository Actions artifact token.
It verifies the attestation subject's byte digest and certificate run invocation,
the exact allowed workflow digest and pinned Action commit, and the Summary
schema and Protocol version before accepting the Attempt. A public tag or JSON
alone is not a trust anchor. The Actions artifact remains archival evidence;
when no acceptable Summary is selected, metrics are unavailable.

For a local scan, set `GITHUB_TOKEN` to a read-capable GitHub token and run
`npm run scan:network`. The GitHub CLI must be installed for cryptographic
attestation verification. The result is `dist/network-projection/network.json`.
Run `npm run test:network` for focused trust and failure-path checks.

Official managed-file digests and pinned Action commits are listed explicitly in
`src/protocol/services/network_compatibility`. A new station or Action version
requires an intentional compatibility review and update; the scanner never
trusts the latest mutable branch by default.
