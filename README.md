# Shoal platform

Shoal makes a GitHub Star explainable: a reviewer publishes their own policy, reviews a repository against a specific commit, and records the decision. A PASS can become a review-backed Star. The [public website](https://taco3064.github.io/shoal-app/) currently explains the mechanism; the Reviewer Directory is planned and no lookup is live yet.

This repository owns the platform website and, in later milestones, shared protocol and schemas, Marketplace Action source, Network Aggregator, and Network Scan. It is one npm package. It does not own the [`gh-shoal`](https://github.com/taco3064/gh-shoal) extension runtime, the [`shoal-station`](https://github.com/taco3064/shoal-station) Network Root and reviewer policy, or the [`shoal-proof-action`](https://github.com/taco3064/shoal-proof-action) distribution surface.

## Local development

Use Node.js 24 and npm:

```bash
npm ci
npm run dev
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run blueprint:validate
```

Astro owns static routing, layouts, metadata, and HTML composition under `src/app/`. The `guide` Blueprint module owns the product explanation and joining guidance rendered as static React HTML; only the share button is an interactive island. Blueprint's Module First topology governs supported TS/TSX source; `.astro` files are framework composition and checked with Astro-aware tooling, not claimed as Blueprint-governed source. Domain and protocol logic belongs in governed modules, not in `.astro` files. A future directory module will be added when a shaped issue introduces real Network Projection behavior.

Husky installs with `npm ci`. Pre-commit formats and lints staged source and checks types; pre-push builds the site. Pull request CI runs lint, type checking, build, and Blueprint checks on Ubuntu and Windows. A successful `main` verification triggers the GitHub Pages deployment workflow. GitHub Pages must be configured with **GitHub Actions** as its build and deployment source in repository settings.

## Joining Shoal

Directly fork the [Network Root](https://github.com/taco3064/shoal-station). Open the fork's **GitHub Actions** page and complete GitHub's manual enable / confirmation. Then clone the fork, install the `gh-shoal` extension, run `gh shoal init`, and edit your fork's `README.md` to write your own review policy. `gh shoal init` cannot replace the manual Actions step.
