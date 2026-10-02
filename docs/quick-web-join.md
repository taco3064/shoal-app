# Quick Web Join on Cloudflare

The public Website remains on GitHub Pages. The backend is a Cloudflare Worker
with one SQLite Durable Object per authorization flow. The Worker is an API, not
a second public Website. GitHub authentication is optional; ordinary public
pages and Local / CLI Join remain available without it.

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
3. In `wrangler.jsonc`, set the public `GITHUB_APP_ID`, `GITHUB_APP_SLUG`,
   `GITHUB_APP_CLIENT_ID`, the actual `JOIN_SERVICE_ORIGIN` and
   `JOIN_WEBSITE_RETURN_URL`. The latter is
   `https://taco3064.github.io/shoal-app/join/` in production. The service origin
   is the exact Worker HTTPS origin, without a path. The configuration declares
   the entry `src/join/worker.ts`, `nodejs_compat`, the compatibility date,
   `JOIN_FLOWS` binding and the `JoinFlow` SQLite migration. Preserve the binding
   and migration identity on subsequent deployments; do not recreate sessions by
   renaming the binding or class.
4. Install using Node 24 and the lockfile: `npm ci`. Authenticate the authorized
   Cloudflare operator with `npx wrangler login`. Generate a GitHub App private
   key and client secret; provide them via interactive Workers Secrets input:

   ```bash
   npx wrangler secret put GITHUB_APP_PRIVATE_KEY
   npx wrangler secret put GITHUB_APP_CLIENT_SECRET
   ```

   Paste the multiline PEM through secret input only. Never commit it, put it in
   `vars`, publish it to Pages, paste it in a ticket, or log it. No additional
   cryptographic signing secret is required: session/CSRF/OAuth identifiers use
   cryptographically random 256-bit values rather than self-signed browser data.
5. Set the GitHub App callback URL to the **real** Worker URL
   `https://<worker>.<subdomain>.workers.dev/auth/callback`. Build and inspect the
   deployable Worker with `npm run build:join`, then deploy using
   `npm run deploy:join`. Confirm `/health` on that exact endpoint. A successful
   dry-run proves packaging only; it is not production deployment evidence.
6. Set GitHub repository Actions variable `PUBLIC_SHOAL_JOIN_SERVICE_URL` to that
   exact verified Worker origin. The existing Network Scan / Pages build consumes
   this one public variable. Publish Pages through its normal successful scan and
   build workflow. The variable is a public service URL, never a secret.
7. Exercise the actual Pages → Worker → Durable Object → GitHub flow below before
   claiming production-complete delivery. The external registration, installation
   and secret steps may be owner-operated; they remain required live evidence.

`deploy/quick-web-join/environment.example` lists public variables and secret
names. It contains no credentials. Local secrets, when needed for authorized
local work, belong only in ignored `.dev.vars`; production uses Workers Secrets.

## Session and credential boundary

Authorization starts in a popup. The temporary OAuth binding cookie is Secure,
HttpOnly, SameSite=Lax and limited to the Worker origin. OAuth state and PKCE
verifier are held in the flow's Durable Object. The callback exchanges the code
server-side and obtains the authenticated Personal Account identity with GitHub.
The user access token is transient and discarded; refresh credentials are not
retained. Only the verified identity is persisted. Subsequent inspection and
mutation revalidate stable identity, Personal Account ownership, direct-fork
parent and exact App installation/repository binding against GitHub.

The popup sends a single-use 60-second handoff to the fixed Website origin.
The browser checks both popup identity and message origin before redeeming it.
Opaque session/CSRF values live in React memory only: not URLs, localStorage or
sessionStorage. Authenticated APIs require an exact Website origin; POSTs also
require the session CSRF nonce. No wildcard-origin authenticated CORS is allowed.
Installation tokens are minted server-side for the exact Reviewer Repository ID
and current operation's minimum permission subset. They exist only during that
request and are never stored in Durable Objects, returned to the browser or
written into logs. App keys and client secrets are injected as Workers Secrets.

Durable state contains OAuth binding, authenticated identity, session/CSRF
binding, one confirmed plan, operation progress and expiry. It survives isolate
replacement. OAuth state expires after ten minutes, a handoff after one minute,
a confirmation plan after five minutes and a session after thirty minutes.
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

Run `npm run test:join`, `npm run test:join:worker` and
`npm run test:join:browser`, then the existing lint, type, Blueprint, build,
Network/Directory/Action and SEO checks. Worker tests use the production bundle
inside workerd with SQLite Durable Objects and controlled outbound GitHub
responses. Browser tests hydrate the actual Website with an explicit backend
fixture. These are useful runtime and behavior evidence, not live GitHub proof.

For live verification, record the exact candidate tree, deployed Worker version,
App ID and permission contract, public Pages origin, real callback URL,
authenticated GitHub user ID and controlled direct-fork Repository ID. Redact
all secret, cookie, handoff, session and CSRF values. Record authoritative
before/after branch heads, governed bytes, Policy bytes and relevant repository
settings, plus the complete changed-path/setting comparison.

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
