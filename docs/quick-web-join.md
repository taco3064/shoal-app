# Quick Web Join on Cloudflare

The public Website remains on GitHub Pages. The backend is a Cloudflare Worker
with one SQLite Durable Object per authorization flow. The Worker is an API, not
a second public Website. GitHub authentication is optional; ordinary public
pages remain available without it, and Local / CLI setup guidance is shown in
the same staged Join journey.

## Reproducible owner bootstrap

1. Use a Cloudflare account with Workers enabled. The baseline uses Workers Free,
   a `workers.dev` endpoint and SQLite Durable Objects; no custom domain, paid
   Worker, Docker host, VPS or separate database is required.
2. Register one project GitHub App in GitHub account settings. Reviewers authorize
   and install this existing App; they do not create their own Apps. Enable
   expiring user access tokens. Request **only** repository Metadata read,
   Contents write, Workflows write, Actions write and Administration write.
   Request no account/organization permissions, webhooks or API fork authority.
   Prefer **Only select repositories** when installing it on a Reviewer's direct
   Personal Account fork. Do not require access to unrelated repositories.
3. Configure the public Worker values as GitHub Actions repository variables:
   `SHOAL_GITHUB_APP_ID`, `SHOAL_GITHUB_APP_SLUG`,
   `SHOAL_GITHUB_APP_CLIENT_ID`,
   `PUBLIC_SHOAL_JOIN_SERVICE_URL` and `JOIN_WEBSITE_RETURN_URL`. The return URL
   is `https://taco3064.github.io/shoal-app/join/` in production. The service
   URL is the exact Worker HTTPS origin, without a path. The committed
   `wrangler.jsonc` preserves the entry `src/join/worker.ts`, `nodejs_compat`,
   compatibility date, `JOIN_FLOWS` binding and `JoinFlow` SQLite migration.
   Preserve the binding and migration identity on subsequent deployments; do not
   recreate sessions by renaming the binding or class.
   The automatic deployment reads the existing Worker settings first. For an
   existing `JOIN_FLOWS` binding to this Worker's `JoinFlow` namespace, it omits
   class migrations and preserves the namespace, including Dashboard/API-created
   namespaces without Wrangler's `v1` migration tag. Only a confirmed missing
   Worker receives the initial SQLite class migration. Failed settings reads,
   mismatched bindings, and existing Workers without `JOIN_FLOWS` stop deployment
   for investigation; do not delete a namespace or change a migration tag to
   force deployment through. No additional Actions variable is required.
   The `SHOAL_GITHUB_*` names are used only for GitHub Actions repository
   variables because GitHub reserves the `GITHUB_` prefix. The Worker runtime
   variables generated during deploy remain `GITHUB_APP_ID`, `GITHUB_APP_SLUG`
   and `GITHUB_APP_CLIENT_ID`.
4. Install using Node 24 and the lockfile: `npm ci`. Authenticate the authorized
   Cloudflare operator once with `npx wrangler login`. Generate a GitHub App
   private key and client secret; provide them via interactive Workers Secrets
   input:

   ```bash
   npx wrangler secret put GITHUB_APP_PRIVATE_KEY
   npx wrangler secret put GITHUB_APP_CLIENT_SECRET
   ```

   Paste the multiline PEM through secret input only. Never commit it, put it in
   `vars`, publish it to Pages, paste it in a ticket, or log it. No additional
   cryptographic signing secret is required: session/CSRF/OAuth identifiers use
   cryptographically random 256-bit values rather than self-signed browser data.
5. Add GitHub Actions deployment credentials as protected repository or
   environment secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The
   API token must be scoped no broader than needed to deploy
   `shoal-quick-web-join` and its existing Durable Object configuration. Do not
   copy the GitHub App private key or GitHub App client secret into GitHub
   Actions; those remain Cloudflare Worker runtime secrets.
6. Set the GitHub App callback URL to the **real** Worker URL
   `https://<worker>.<subdomain>.workers.dev/auth/callback`. Build and inspect
   the deployable Worker with `npm run build:join`. Ordinary production delivery
   after bootstrap is automatic: successful `main` Verify triggers
   `Deploy Quick Web Join Worker`, which checks out the exact verified `main`
   SHA, deploys the Worker with Wrangler, and verifies production `/health`.
   A successful dry-run proves packaging only; it is not production deployment
   evidence.
7. GitHub Pages publication waits for the successful Worker deployment workflow
   for the same `main` SHA, then Network Scan builds Pages with
   `PUBLIC_SHOAL_JOIN_SERVICE_URL`. The variable is a public service URL, never a
   secret. Exercise the actual Pages → Worker → Durable Object → GitHub flow
   below before claiming production-complete delivery. The external
   registration, installation and secret steps may be owner-operated; they remain
   required live evidence.

`deploy/quick-web-join/environment.example` lists public variables, GitHub
Actions deployment secrets and Worker runtime secret names. It contains no
credentials. Local secrets, when needed for authorized local work, belong only in
ignored `.dev.vars`; production runtime secrets use Workers Secrets.

## Local manual authorization check

For UX work, localhost must exercise the real authorization handoff rather than
only the Playwright fixture. Use an explicit local origin pair:

1. Create or edit a non-production GitHub App used only for development. Set its
   callback URL to the exact local service callback, for example
   `http://127.0.0.1:8787/auth/callback`. Keep the same minimal permissions as
   production and install it only on controlled test repositories.
2. Put development-only values in ignored `.dev.vars`:

   ```bash
   GITHUB_APP_ID=...
   GITHUB_APP_SLUG=...
   GITHUB_APP_CLIENT_ID=...
   GITHUB_APP_CLIENT_SECRET=...
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   JOIN_SERVICE_ORIGIN=http://127.0.0.1:8787
   JOIN_WEBSITE_RETURN_URL=http://127.0.0.1:4321/shoal-app/join/
   ```

3. Start the Worker locally:

   ```bash
   npx wrangler dev --local --port 8787
   ```

4. In another terminal, run one supported localhost Website path:

   ```bash
   npm run dev -- --host 127.0.0.1 --port 4321
   ```

   or verify the built site locally:

   ```bash
   npm run build
   npm run preview -- --host 127.0.0.1 --port 4321
   ```

   On `localhost`, `127.0.0.1`, or `[::1]`, the Website defaults Quick Web Join
   to `http://127.0.0.1:8787` when `PUBLIC_SHOAL_JOIN_SERVICE_URL` is absent, so
   the **Sign in with GitHub** button is enabled in both dev and preview mode.
   `.env.local.example` documents the same default for explicit local env files:

   ```bash
   cp .env.local.example .env.local
   ```

   To use a different service origin, edit `.env.local` or set it inline before
   the Website command:

   ```bash
   PUBLIC_SHOAL_JOIN_SERVICE_URL=http://127.0.0.1:8787 npm run dev -- --host 127.0.0.1 --port 4321
   ```

5. Open `http://127.0.0.1:4321/shoal-app/join/`, choose **Sign in with GitHub**,
   complete GitHub authorization, and verify the popup returns to the same Join
   page with an authenticated inline journey. If you choose `localhost` instead
   of `127.0.0.1`, set `JOIN_WEBSITE_RETURN_URL` to the matching `localhost`
   origin and path; the Worker checks the exact Website origin.

Local HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]` origins.
Any non-local authenticated origin still requires HTTPS. The Worker still checks
the exact Website origin; do not use wildcard authenticated CORS. Never reuse a
production App client secret, private key, or installed production repository
for local verification.

## Session and credential boundary

Authorization starts in a popup. The temporary OAuth binding cookie is Secure,
HttpOnly, SameSite=Lax and limited to the Worker origin. OAuth state and PKCE
verifier are held in the flow's Durable Object. The callback exchanges the code
server-side and obtains the authenticated Personal Account identity with GitHub.
The short-lived user access token is retained in the active Durable Object
instance's memory, keyed by the bounded session id, so subsequent authoritative
inspection uses authenticated GitHub REST requests rather than the anonymous
shared-IP quota. A sealed token envelope is also written to Durable Object SQL
using AES-GCM with Worker-secret key material and session-id authenticated data,
so a normal isolate replacement can re-establish authenticated GitHub authority
without persisting the raw token. Refresh credentials are not retained. The raw
token is never returned to the browser, written to logs, or written into Durable
Object SQL. Subsequent inspection and mutation revalidate stable identity,
Personal Account ownership, direct-fork parent and exact App
installation/repository binding against GitHub.

The popup sends a single-use 60-second handoff to the fixed Website origin.
The browser checks both popup identity and message origin before redeeming it.
The Worker sets an HttpOnly, Secure, SameSite=None session cookie for the Worker
origin so a page reload can restore the still-valid Durable Object session when
the browser accepts credentialed cross-origin cookies. The Website also stores
only the opaque session id, CSRF nonce and public identity in tab-scoped
`sessionStorage` so ordinary refresh does not orphan a still-valid server
session when third-party cookies are unavailable. GitHub tokens, App private
keys, client secrets, installation tokens and refresh credentials are never
placed in browser storage. Authenticated APIs require an exact Website origin and
credentialed CORS; POSTs also require the session CSRF nonce. No wildcard-origin
authenticated CORS is allowed.
Installation tokens are minted server-side for the exact Reviewer Repository ID
and current operation's minimum permission subset. They exist only during that
request and are never stored in Durable Objects, returned to the browser or
written into logs. App keys and client secrets are injected as Workers Secrets.

Durable state contains OAuth binding, authenticated identity, a sealed user-token
envelope, session/CSRF binding, one confirmed plan, operation progress and
expiry. It survives isolate replacement; raw privileged GitHub credentials do
not. OAuth state expires after ten minutes, a handoff after one minute, a
confirmation plan after five minutes and a session after thirty minutes.
Expiry is checked on every request and cleanup uses a Durable Object alarm.
Logout deletes the record. An interrupted execution preserves verified progress;
GitHub remains authoritative and retry requires fresh inspection. No destructive
rollback or blind replay is performed. Do not log request authorization headers,
OAuth query strings, cookies, request bodies or secret values.

Each Durable Object alarm advances at most one operation of the original
confirmed plan, persists the checkpoint and schedules the next operation. This
keeps execution within the Workers Free external-request budget and permits
isolate replacement between steps. Root file snapshots are reused only after a
fresh authoritative head check proves the immutable generation is unchanged;
the selected Node is revalidated by stable Repository ID. The executable
four-operation fixture measures each step below 50 external requests and the
complete discovery/setup below 60 unauthenticated GitHub REST requests.

## Permission and exact mutation allowlist

| Repository permission | GitHub API operation |
| --- | --- |
| Metadata read | GET exact repository metadata, owner, parent and installation membership |
| Contents write | GET immutable content/commits; POST `/repos/{owner}/{repo}/git/trees` and `/git/commits`; PATCH `/git/refs/heads/{defaultBranch}` with `force:false` |
| Workflows write | Git data write containing `.github/workflows/reviewer-summary.yml`, only when that governed path actually changes |
| Actions write | GET `/repos/{owner}/{repo}/actions/workflows/reviewer-summary.yml`; PUT `/actions/workflows/{verifiedId}/enable`; verify exact ID/path/active state |
| Administration write | GET/PUT `/repos/{owner}/{repo}/actions/permissions`; PATCH `/repos/{owner}/{repo}` with only `has_issues:true`; authoritative read-back |

The App JWT authorizes POST `/app/installations/{id}/access_tokens` with
`repository_ids:[boundRepositoryId]` and per-operation permissions. Inspection
uses a separate read-only subset. GitHub requires Administration write for
repository Actions policy and Issues mutation; this grant does not expose generic
administration. Actions enablement changes only `enabled` while replaying any
required authoritative `allowed_actions` and `sha_pinning_required` values. It
never changes default workflow permissions or unrelated Actions policy surfaces.

The service exposes only these shaped operations. Browser-selected GitHub paths,
methods, arbitrary body fields, repository IDs, installation IDs and operation
names cannot select privileged targets. Automatic content synchronization writes
only `.github/ISSUE_TEMPLATE/review-request.yml` and
`.github/workflows/reviewer-summary.yml`, together in at most one commit from
one exact Root generation and one exact Node parent. No force update is allowed.
The separate, explicitly confirmed Policy commit changes only `README.md` and
uses its own exact branch/blob/content guard. An unchanged default or retained
Policy creates no commit. A stale Root, branch, Policy or authority binding
requires a fresh plan and confirmation.

Platform compatibility remains the exact Workflow-digest authority shared with
Network Projection. Root publication alone does not grant support. An unadmitted
Root generation cannot overwrite an already-supported station; canonicality,
Platform support and Station Readiness remain separate visible facts.
Station Readiness uses the shared Network Projection predicate: Issues enabled
and admitted exact form/Workflow digests. It does not prove Workflow
executability. Repository Actions and Workflow activation remain separate setup
stages and confirmed operations even when the station is already ready.

### Fork Actions prerequisite and canonical activation

Repository Actions policy, workflow registry availability, canonical workflow
identity and canonical activation are separate inspected facts. In a fresh
public fork, GitHub can return `enabled: true` from Actions permissions while
the workflow registry is empty and the canonical workflow lookup returns 404.
The policy field alone therefore cannot authorize canonical activation.

Inspection reads the repository workflow registry (`per_page=1` is enough to
establish non-empty availability) and separately looks up the canonical path.
If the governed files already match one supported exact Root generation but the
registry is unavailable, the confirmed plan includes the ordered dependency
`enable_actions → enable_workflow`. The canonical filename and immutable bytes
fix the activation target before confirmation; no operation is appended later.
Actions must verify the preserved policy and registry availability before the
next durable invocation can inspect and activate the canonical identity. A
failed prerequisite stops the plan and leaves the dependent operation queued.
Each invocation re-inspects the last verified checkpoint; stale authority stops
execution rather than continuing blindly. Already-active Workflow state requires
no activation mutation, but still receives authoritative verification.

If the governed files do not yet match, activation is not pre-confirmed. If no
governed file exists and the registry is empty, managed-file synchronization
first supplies a workflow for authoritative discovery. Truly new work requires
fresh inspection and a new confirmation. A missing canonical identity while
another workflow is registered remains unverified and requires inspection, not
blind enable.

Activation uses the supported `reviewer-summary.yml` filename endpoint, retaining
exact canonical path and numeric identity checks before and after mutation.
Already-converged inspection schedules neither operation.

The registry availability observation participates in stale-plan fingerprinting.
Policy, branch, Root generation, installation binding and canonical Workflow
guards remain unchanged. Reviewer-owned `README.md` is not touched.

Real installation-authority evidence for the initial disabled fork and both
transitions is recorded in [Stage 4 API evidence](quick-web-join-stage4-api-evidence.json).
It demonstrates GitHub behavior before implementation, not a post-merge field
gate for this delivery. The controlled repository is now Actions-enabled with
an active canonical workflow; subsequent production inspection must recognize
that state without replaying verified mutations.

## Browser API

| Endpoint | Contract |
| --- | --- |
| GET `/health` | Non-secret Worker health only |
| GET `/auth/start` | GitHub App OAuth / PKCE start |
| GET `/auth/callback` | Fixed-origin single-use handoff or cancellation |
| POST `/api/session` | `{code}` → opaque session, CSRF nonce and verified identity |
| POST `/api/inspect` | `{}` → authoritative public inspection and opaque `planId` |
| POST `/api/execute` | `{planId}` → consumed station confirmation and `jobId` |
| GET `/api/status?jobId=...` | Session-bound durable verified progress/result |
| POST `/api/policy/plan` | `{planId,choice:'keep'|'default'|'custom',content?}` → exact Policy preview and new plan |
| POST `/api/policy/confirm` | `{planId}` → separate consumed Policy confirmation/job |
| POST `/api/logout` | `{}` → delete session and confirmations |

Polling is one request per second while work runs, with cleanup on unmount.
Determinate progress counts only operations in the confirmed plan, and advances
only after authoritative read-back. Previously complete stages remain visible
without inflating that denominator. Failures freeze progress; a retry recalculates
its own remaining plan. Directory publication is a later successful Network Scan
and Pages publication, never an immediate mutation or guaranteed deadline.

## Verification and production field evidence

Run the existing lint, type, Blueprint, build, Worker dry-run, Network scan,
Action package and SEO validation commands. Runtime smoke evidence should be
captured as development-only verification and must not be committed as project
test files.

For live verification, record the exact candidate tree, deployed Worker version,
App ID and permission contract, public Pages origin, real callback URL,
authenticated GitHub user ID and controlled direct-fork Repository ID. Redact
all secret, cookie, handoff, session and CSRF values. Record authoritative
before/after branch heads, governed bytes, Policy bytes and relevant repository
settings, plus the complete changed-path/setting comparison.

For production delivery verification, record the exact successful `main` Verify
SHA, the `Deploy Quick Web Join Worker` run, Wrangler deployment success for
`shoal-quick-web-join`, production `/health` success, and the subsequent Network
Scan / Pages deployment run for the same SHA. A PR-only Verify, failed `main`
Verify, Worker dry-run, or local `npm run deploy:join` is not production-complete
deployment evidence.

Exercise real authorization start/cancel; native fork and selected-repository
App access; already-forked incomplete setup; confirmed Issues/Actions/managed
files/workflow convergence; visible verified progress; controlled partial failure
and remaining-only retry; a second already-converged no-op; Policy preservation,
unchanged default adoption and separately confirmed customized content; concurrent
branch/README stale refusal; logout/expiry; and wrong owner/organization/downstream
or revoked installation rejection. Prove no unconfirmed paths or settings changed.
Then verify station readiness and the distinct waiting-for-publication message.

External credentials or deployment evidence must never be replaced by synthetic
field claims. Without an actual Worker, registered App, configured Pages origin
and controlled live before/after evidence, full #31 Acceptance remains blocked.


### Stage-local progression and completion

Manual inspection lives after the current stage's content and Local / CLI detail.
Continue or Check again requests fresh authoritative inspection; it never locally completes a
stage. External return, popup close, focus and visibility still trigger the same
deduplicated inspection. Fork and App access return inspection, Station execution,
and Policy confirmation advance automatically and show no redundant Continue in
their normal Web-assisted states. Retry, stale, failure, blocked-popup and Local /
CLI states retain a stage-local Check again inspection fallback.

### External-action return reconciliation

Opening an incomplete fork or App-access step records only its stage, validated
identity ID and start time in tab-scoped sessionStorage. This optional hint is
valid for 30 minutes. It contains no repository target, credential, execution
plan or stage-completion claim; restoring it never grants mutation authority.
Session restoration must still pass server validation before reconciliation.

Visible focus, visibility, pageshow and usable-popup closure feed one coordinator.
Each return permits at most four authoritative inspections: immediately, then
after 1, 2.5 and 5 seconds. The attempt window also has a 15-second deadline.
Busy inspections/jobs share the existing guard rather than starting concurrent
requests. Hidden pages, pagehide, unmount and session changes cancel scheduled
work. Popup-handle observation is at most 2 Hz while eligible and expires with
the hint; it performs no network request unless closure triggers reconciliation.

An unchanged result retains the hint for a later return. Exhaustion exposes
stage-local Check again without inventing an error or completion. Closing GitHub
without acting is a normal cancellation. Delayed GitHub visibility can converge
through bounded retries; completing a still-open tab later can converge through
another return. Fresh authoritative completion clears the hint and cancels work.
Logout, expiry and identity changes discard hints, while generation guards reject
responses from an earlier session. Invalid or expired stored hints are discarded.

#### Required field evidence for this repair

Use a controlled account and record candidate head/tree, device/browser/version,
before stage, external action taken or not taken, return lifecycle, inspection
behavior, final authoritative stage and whether any manual click was needed.
Do not replace real mobile evidence with narrow desktop screenshots or synthetic
lifecycle events. In addition to existing controlled onboarding checks, exercise:

- Stage 2 and Stage 3 completion with the GitHub tab closed and left open;
- early unchanged return, then completion in the same external tab and return;
- close without acting, delayed visibility and bounded exhaustion with Check again;
- mobile background/restore, pageshow and reload with a valid hint;
- rapid return signals, logout/expiry during inspection and stale response rejection;
- unchanged ordered Station execution, separate Policy confirmation and terminal Ready.

Full repair Acceptance remains blocked until the real mobile return/restore
evidence is available. After merge, repeat the controlled production smoke on
the exact successful main deployment before closing #31.

Stage 6 explicitly shows “Onboarding complete.” Publication waiting is
informational. Its optional Refresh status control is a secondary utility, not a
next onboarding action. Completed zero-operation jobs render no progress panel;
meaningful verified history and actionable failed/blocked progress remain visible
inside the current stage.
