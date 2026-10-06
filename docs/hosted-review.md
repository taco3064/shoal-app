# Hosted Review operations

The Website configures a station and holds encrypted authorization material.
Semantic execution remains in the exact Hosted Action and shared `gh-shoal`
runtime. Hosted settings follow the six-stage Join journey without adding an
onboarding stage. The Personal Account Root owner uses the same settings.

## Optional installation authority

The existing Quick Web Join permissions remain its base access contract. Hosted
configuration additionally needs repository **Variables write**. Broker lifecycle
issuance needs **Issues write**, restricted to the requesting station through
`repository_ids` and an installation token with Metadata read / Issues write.
Existing installations must explicitly approve added permissions. An installation
without Variables access remains usable for base onboarding and local CLI setup.

GitHub's API permission key for repository Variables is `actions_variables`,
both in installation metadata and installation-token permission requests. The
Hosted adapter must not use `variables`; that key incorrectly reports a valid
installation as missing authority. Production testing on 2026-10-06 confirmed
the public App metadata returned `actions_variables: write` after permission
approval. The adapter uses this key for node-scoped read/write token requests.

Only these station variables are managed by Hosted settings:

| Variable | Source |
| --- | --- |
| `SHOAL_AUTOMATED_REVIEW` | Explicit Reviewer choice |
| `SHOAL_HOSTED_BROKER_URL` | Platform Worker configuration |
| `SHOAL_HOSTED_BROKER_AUDIENCE` | Platform Worker configuration |

Inspection never creates variables. Enablement and explicit repair converge
broker variables before writing the selected mode, with authoritative read-back.
None can be saved independently of Hosted compatibility or Reviewer grant when
current Membership and Variables authority are available. These operations do
not edit workflows, Policy or repository commits.

## Separate recurring authorization

Register a separate project OAuth App with its callback set to the exact
production Worker origin plus `/hosted/auth/callback`. The existing bounded
GitHub App login does not establish this grant. The OAuth flow explicitly requests
`public_repo offline_access`, uses PKCE and a server-held single-use state with a
Secure HttpOnly browser binding created through a top-level Worker redirect, and
verifies the returned Personal Account and
current Root/direct-fork Membership.

Store the following runtime configuration:

| Worker value | Storage |
| --- | --- |
| `HOSTED_OAUTH_CLIENT_ID` | Public Worker variable; optional deployment repository variable `SHOAL_HOSTED_OAUTH_CLIENT_ID` |
| `HOSTED_OAUTH_CLIENT_SECRET` | Worker secret |
| `HOSTED_GRANT_ENCRYPTION_KEY` | Independent high-entropy Worker secret of at least 32 characters |
| `HOSTED_BROKER_AUDIENCE` | Public Worker variable; default `shoal-hosted-review` |
| `HOSTED_GRANTS` | Dedicated `HostedGrant` SQLite Durable Object namespace |

The automatic deployment preserves an already configured OAuth client ID and
dedicated secret bindings. Provision secrets through Workers Secrets input,
never chat, repository content, Actions variables or logs. Keep the grant key
independent of GitHub App credentials. Changing it without a deliberate migration
makes existing ciphertext unusable and requires explicit reauthorization.

Grants bind stable Reviewer ID and Repository ID. Refresh rotation is serialized
and durably marked before contacting GitHub. Interrupted or ambiguous rotation
fails closed instead of retrying old refresh material. Expired, revoked,
reconsent-required and ambiguous states are shown separately. Disconnect clears
Shoal-held authority even when upstream revocation cannot be confirmed; reconnect
requires explicit consent. Neither operation changes the saved mode.

## Machine exchange

`POST /hosted/exchange` accepts format 1 JSON and a GitHub Actions OIDC bearer
assertion. It validates the exact audience, live run ID/attempt, current owner,
public Root/direct fork, default-branch caller/reusable identities and SHA, both
workflow byte digests, and current enabled mode before issuing any authority.
The Platform Hosted registry binds exact caller, auxiliary, Action and runtime
provenance. Mutable tags and current main never create support.

Success returns only the matching Repository/Reviewer IDs, distinct short-lived
Reviewer and lifecycle tokens, and bounded expiry. Reviewer OAuth authority is
used for Reviewer-authored identity effects; lifecycle authority is node-scoped.
Neither substitutes for Copilot's workflow execution token. The exchange is not
a general GitHub proxy and never returns refresh material.

## Deployment and evidence

This repository does not retain test files or test-only fixtures. CI runs lint,
typecheck, architecture inspection, builds and artifact validation. Any temporary
behavioral verification belongs outside the repository. `npm run build:join`
checks both Durable Object bindings. Existing namespaces are inspected before
the Hosted migration; inconsistent bindings, unbound classes or unknown migration
state stop deployment without recreating JoinFlow.

Final production acceptance also requires exact-main Verify and normal Worker
deployment, production health, explicit optional permission approval and Reviewer
grant, a controlled canonical OIDC exchange and identity-bearing lifecycle, the
independent Summary path, revoked-grant refusal, and None skipping Hosted work.
Record commit/tree, caller and auxiliary digests, Action/runtime provenance,
station head and run ID/attempt. Redact all credentials, authorization headers,
cookies and session values. Local screenshots and controlled API fixtures prove
presentation only; they do not replace these live gates.

## Published dependency integration (2026-10-06)

The current Hosted registry uses the published
Action and the exact merged Station bytes:

| Immutable fact | Verified value |
| --- | --- |
| Action v0.2.1 commit | `85dde9b9760be9a640b29b1f4c2a6aa911b2cb37` |
| Action tree (unchanged from accepted candidate) | `ba06f41743e4fb46bfa5adfe3ad569e3e257df73` |
| Station source commit | `83e0b94ddb3b690db0e5b1d2ff4c5189e17c4fe1` |
| Auxiliary SHA-256 | `eabb769e5810789e2c83232a8dc86bef23e87cc3b268ea788007f0e699a49537` |
| Caller SHA-256 (unchanged) | `b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105` |

The workflow digests were verified from the GitHub Contents API at that Station
commit, preserving original bytes. The release tag was dereferenced to its commit;
the registry still trusts an immutable SHA, never a mutable tag.

Before test-file removal, local Windows tests on Node 24.16.0 passed:
Hosted 54, Summary 72, workload 17.
Typecheck, Blueprint doctor/inspect with baseline, static build,
SEO/workload artifact validation, the 31-file Action
package validation, and Worker dry-run with both Durable Object bindings passed.
Lint passed with 0 errors and 125 advisory warnings; the build retained its
large-chunk advisory. These results describe the local working tree, not a new
remote exact-head CI run.
The Hosted suite uses locally signed assertions and controlled GitHub responses;
it does not prove a production GitHub OIDC exchange.

Production inspection found `/health` returning HTTP 200 with `healthy: true`,
but unauthenticated `POST /hosted/exchange` returned HTTP 401 `SESSION_EXPIRED`,
not the candidate broker's `MACHINE_IDENTITY_REFUSED`. The latest successful
[Worker deployment](https://github.com/taco3064/shoal-app/actions/runs/37204185622)
still targets `134d82457c99777cba752a549fb7e26ab239d71c`, the pre-PR main.
The canonical Station has no configured Actions variables at inspection time.
Production OIDC, identity-bearing lifecycle/read-back, revoked-grant refusal,
and live None skipping remain unverified until deployment and explicit Reviewer
configuration/authorization. This local integration does not close #49.

## Historical code-review candidate chain (#49)

The owner requested code and review-ready PRs before owner testing, merging,
publication, permission approval or production authorization. This candidate
therefore records exact accepted upstream objects without claiming production
completion. No owner login or release action is required to review this PR set.

| Immutable fact | Candidate |
| --- | --- |
| Accepted Platform bootstrap commit / tree | `05e2a5603c5c7da56708ed71aebfe02fe728af7a` / `7aeb267776221cb7628deeb3d8d33c29e58aee85` |
| Canonical caller SHA-256 | `b9162cae864bbd6e00745346f37f701fe5c003d3367cc3dc37c6fb394f9d8105` |
| Runtime source commit / tree | `230a97af21c45b8d8f0cdcd4a02d13dddd2c4730` / `db8cfb7ed4cb54c4bc60569b5e55ed36fa68452c` |
| Hosted Action candidate commit / tree | `13ab1fd2a6a927e22dc37851cbfc0a28b177aebb` / `ba06f41743e4fb46bfa5adfe3ad569e3e257df73` |
| Hosted Action path | `hosted-review/` |
| Auxiliary workflow SHA-256 | `4bf2bb64b42f14aac53eee395482717c5f10ebdb416ba053240c01ffb85c2388` |
| Summary Action | `4918e1afe85f15f8fe263eaf2866cd02a1f70a62` |
| Broker contract | `formatVersion: 1` |

The Action candidate passed exact-head Hosted CI run `37320556864` (including
live Copilot semantic validation) and distribution CI run `37320556819`.
The station auxiliary pins that exact immutable candidate; its fixture bytes
match the single Platform-owned Hosted registry. Earlier published auxiliary
bytes remain unsupported for Hosted exchange without changing base readiness.

Before production completion, the owner must review the coordinated Action,
station and Platform PRs, establish the repository's final distribution objects,
and run the production evidence gates above. If the final auxiliary bytes or
Action/runtime identities change, refresh this binding and return the entire
changed Candidate Set through independent Acceptance and exact-head CI.
Do not close #49 on code-review evidence alone.
