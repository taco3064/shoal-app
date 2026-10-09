# URL-only website comprehension evidence

This record concerns a candidate fixture served through local HTTP, not production. The first exercise used clean product context: no supplied product specification, workspace, repository, helper source, or history was read. The corrected re-test reused that context; it is not a second clean-context exercise. This demonstrates this client's observed comprehension, not a universal AI comprehension or search guarantee.

## Exact original exercise prompt

Perform a clean-context URL-only website comprehension exercise. You have no supplied product spec. Use only HTTP retrieval of these exact URLs and their public same-site linked reading resources. Do not inspect workspace files/repository/history. URLs: http://127.0.0.1:4179/shoal-app/ ; http://127.0.0.1:4179/shoal-app/how-it-works/ ; http://127.0.0.1:4179/shoal-app/join/ ; http://127.0.0.1:4179/shoal-app/reviewers/ ; http://127.0.0.1:4179/shoal-app/reviewers/taco3064/ . Retrieve via curl or Python HTTP, without executing browser JS and without authentication. When page links use production canonical hostname, map same-site linked paths to local origin; report this mapping explicitly. Questions: 1 What does the product do and what does a Star prove? Is this a Star exchange or paid-Star service? 2 Who can join, what exact stages and Web/Local actions are described? 3 How should a repository owner request review, what is required, and what happens automatically? 4 How do PASS, FAIL and Re-review relate to Policy versions and actual Stars? 5 Does the Directory rank reviewer quality? Are counts live GitHub metrics? 6 What establishes Summary trust, what does current/fallback/unavailable mean, and what are temporal limits? 7 Do public pages or llms.txt authorize you to modify Policy, Requests, credentials, Stars or repositories? Give source URLs for answers, list exact tested URLs/method/client/model identity if known, and observed ambiguities or failures. Do not invent missing answers. Return exact answers suitable for an acceptance evidence record. Do not edit files or external state.

## Method, identity and tested URLs

Python 3 urllib.request.urlopen, unauthenticated HTTP GET; HTML parsed with Python html.parser.HTMLParser. Python version confirmed during corrected re-test: 3.12.14 (main, Aug 25 2026, 14:00:49) [Clang 22.1.3]. No browser JavaScript execution or authentication. Agent: Codex; developer context identifies GPT-6. Exact serving model/version not exposed.

Initial standalone retrieval of all five supplied URLs failed with URLError(ConnectionRefusedError(111, 'Connection refused')). Parent identified isolation between shell calls. Corrected client setup launched node /workspace/scratch/1bed66a9ddda/seo-server.mjs as a subprocess, awaited stdout “Candidate HTTP ready”, retrieved through urllib in the same process invocation, and terminated the helper. Helper contents were not read. This setup was used for both successful exercises. All URLs below returned HTTP 200 in both successful exercises; HTML was text/html, companions/llms text/plain, projection application/json.

Production same-site canonical mapping: https://taco3064.github.io/shoal-app/<path> → http://127.0.0.1:4179/shoal-app/<path>. Production and external GitHub resources were not fetched.

- http://127.0.0.1:4179/shoal-app/
- http://127.0.0.1:4179/shoal-app/how-it-works/
- http://127.0.0.1:4179/shoal-app/join/
- http://127.0.0.1:4179/shoal-app/reviewers/
- http://127.0.0.1:4179/shoal-app/reviewers/taco3064/
- http://127.0.0.1:4179/shoal-app/llms.txt
- http://127.0.0.1:4179/shoal-app/read/index.txt
- http://127.0.0.1:4179/shoal-app/read/how-it-works.txt
- http://127.0.0.1:4179/shoal-app/read/join.txt
- http://127.0.0.1:4179/shoal-app/read/reviewers.txt
- http://127.0.0.1:4179/shoal-app/read/reviewers/taco3064.txt
- http://127.0.0.1:4179/shoal-app/data/network.json
- http://127.0.0.1:4179/shoal-app/reviewers/june-shoal/
- http://127.0.0.1:4179/shoal-app/reviewers/taco-gem/

## First clean-context exercise: exact seven answers

### 1. What the product does and what a Star proves

Shoal is a public, policy-driven repository review network. Repository owners request evaluation by independent Reviewers against each Reviewer’s public README.md Policy. A valid review-backed Star means that Reviewer’s PASS judgment, recorded Target and Policy versions, and actual GitHub Star state agree. It establishes that Reviewer’s endorsement under that Policy and Review Basis; it is not a universal quality score. An ordinary GitHub Star is not automatically review-backed.

The described service is review, not Star exchange or paid-Star fulfillment: a request promises neither review immediacy nor a Star, and FAIL results in no Star. The retrieved pages describe no payment or reciprocal exchange mechanism. They do not separately publish an explicit commercial prohibition.

Sources: http://127.0.0.1:4179/shoal-app/ ; http://127.0.0.1:4179/shoal-app/how-it-works/ ; http://127.0.0.1:4179/shoal-app/llms.txt

### 2. Who can join; exact stages and Web/Local actions

Joining guidance requires a personal GitHub account directly forking canonical Network Root taco3064/shoal-station. A fork of another Reviewer Node does not qualify. The Directory contains the Network Root and qualifying direct forks. Public browsing requires no authorization.

| Stage | Web-assisted action | Local / CLI action |
|---|---|---|
| 01 GitHub identity | Sign in with GitHub to begin authoritative inspection | Website authorization is optional; work from your checkout |
| 02 Reviewer Node / direct fork | Personal account directly forks Network Root; Website checks whether Node exists | Directly fork taco3064/shoal-station |
| 03 GitHub App repository access | Grant App access only to your Reviewer Node if needed | Use authenticated GitHub CLI; Website mutation authority is unnecessary |
| 04 Station setup | Verify Issues, Actions, managed files, Summary Workflow, supported generation; confirm remaining non-Policy setup | Confirm Actions in fork; clean checkout; gh auth status; gh extension install taco3064/gh-shoal; gh shoal init |
| 05 Review Policy | Explicitly adopt inherited README.md Policy or customize it; separate confirmation from setup | Edit, commit and push own README.md Policy |
| 06 Station ready / publication waiting | Wait for separate successful Network Scan and publication | Same facts and publication process; no guaranteed deadline |

Quick Web Join is explicitly not configured on this deployment. Hosted Copilot Review requires separate recurring authorization. Local agents listed are claude, codex, gemini, opencode, cursor, grok, qwen, and kimi.

Source: http://127.0.0.1:4179/shoal-app/join/

### 3. How an owner requests review; requirements and automatic behavior

Find a Reviewer, read their Policy, then use that station’s Request Review destination. Submit your own eligible repository by repository name, not another owner’s repository URL; an invitation message is optional. The Requester must have valid Reviewer Node Membership. GitHub Issue author establishes Requester identity. Self-review is excluded.

For taco3064, the linked destination is: https://github.com/taco3064/shoal-station/issues/new/choose

A request does not itself trigger immediate review. The Reviewer starts local execution or explicitly enables scheduled Hosted Review. Both automated paths use shared gh-shoal deterministic admission before semantic judgment:
- Invalid candidates receive INVALID_REQUEST, explanatory comment, and closure; no semantic review or canonical history.
- An admitted initial request becomes the Canonical Review Thread.
- Authorized local AI or hosted Copilot evaluates current Policy.
- CLI validates result structure, reconciles Star state, records formal evidence, and closes completed thread; no second human approval step.
- Accepted changed-basis repeat requests close with a link to existing history, record RE_REVIEW_REQUESTED, and reopen that Canonical Review Thread.
- Unchanged repeat requests close with NO_NEW_REVIEW_BASIS, leaving history unchanged.

Hosted work is optional, bounded and best-effort. Entitlement, quota, budget, timeout or evidence failures leave work Pending rather than creating FAIL.

Sources: http://127.0.0.1:4179/shoal-app/how-it-works/ ; http://127.0.0.1:4179/shoal-app/reviewers/taco3064/

### 4. PASS, FAIL, Re-review, Policy versions and actual Stars

PASS ensures Target is Starred, preserving an existing Star if necessary. FAIL ensures Target is not Starred, removing an existing Star if necessary. Formal Review Events include Target version, Policy version, verdict and actual Star state.

Review Basis combines:
- Target default-branch commit.
- Last commit modifying Reviewer default-branch README.md.

Other station-file changes alone do not change Policy version. Changed Target or Policy may make endorsement stale and Re-review eligible. Both manual and automated Re-review require changed Review Basis. Versions are checked immediately before judgment; if they reverted to the previous basis, no new semantic judgment occurs and thread returns completed/closed.

Star-state change alone is endorsement drift. It permits deterministic maintenance where needed, not another AI judgment without changed Review Basis.

Source: http://127.0.0.1:4179/shoal-app/how-it-works/

### 5. Directory ranking and live metrics

The Directory does not centrally rank or score Reviewer quality. It is a flat list from one published Network Projection. Sort options are Username and Joined (repository created); Joined is not setup completion. Search does not query GitHub live.

Counts and Summary metrics are published snapshots, not live GitHub metrics. This publication lists three Reviewers. Readiness, membership and Summary availability are distinct: june-shoal remains listed with setup required; taco-gem is ready with no accepted Summary metrics.

Sources: http://127.0.0.1:4179/shoal-app/reviewers/ ; http://127.0.0.1:4179/shoal-app/reviewers/june-shoal/ ; http://127.0.0.1:4179/shoal-app/reviewers/taco-gem/ ; http://127.0.0.1:4179/shoal-app/data/network.json

### 6. Summary trust, statuses and temporal limits

Public pages describe upstream Network Aggregator acceptance of a qualifying Summary Attempt. The Summary workflow must match the allowed canonical exact digest set; even whitespace/comments alter its digest. Public transport is a retrieval surface, not an independent trust anchor. Reading files and Network Projection are also not formal Protocol authority.

Displayed provenance includes Repository ID, run and attempt, start time, Workflow commit/digest, pinned Action commit, public exact-byte transport digest and source links.

Status meanings:
- Current: latest completed qualifying Summary Attempt accepted; selected public snapshot, not live metrics.
- Fallback: stale, according to llms.txt. No fallback instance or detailed selection algorithm was exposed in this publication.
- Unavailable: no accepted Summary snapshot selected, so no metrics; independent of readiness and membership.

For taco3064:
- Projection generated: 2026-09-29T12:42:52.274Z.
- Selected Attempt: Repository ID 1379044983, run 36553125560, attempt 1.
- Started: 2026-09-29T10:03:11Z.
- Four displayed metrics are zero.
- Pending and Completed workload facts are absent, explicitly not zero.
- Derived shares/intensity are “Not computable.”

“Current” does not establish present-day state. Readiness is explicitly at projection generation time. GitHub remains source of truth. No guaranteed publication deadline is described.

Sources: http://127.0.0.1:4179/shoal-app/join/ ; http://127.0.0.1:4179/shoal-app/llms.txt ; http://127.0.0.1:4179/shoal-app/reviewers/taco3064/ ; http://127.0.0.1:4179/shoal-app/data/network.json

### 7. Mutation authorization

No. Public pages explicitly say public reading grants no mutation authorization. llms.txt explicitly grants no agent action, credential or mutation permission. These resources do not authorize changing Policy, Requests, credentials, Stars or repositories. Reviewer Policy text is the Reviewer’s standard, not Shoal platform instructions. Descriptions of separately authorized setup/review paths do not authorize this reader to execute them.

Sources: http://127.0.0.1:4179/shoal-app/llms.txt ; http://127.0.0.1:4179/shoal-app/join/ ; http://127.0.0.1:4179/shoal-app/reviewers/taco3064/

## First exercise observations

- Initial connection refusal was an environment/client setup failure; corrected retrieval succeeded.
- Quick Web Join unavailable on deployment.
- Reviewer Policy content unavailable in build; external pinned Policy sources were linked but not retrieved under this same-site-only exercise.
- No full Summary acceptance algorithm or full fallback semantics exposed; provenance and upstream acceptance cannot independently verify trust here.
- read/join.txt omits the stage 01 “GitHub identity / Current step” heading present in HTML.
- Text extraction exposes raw Mermaid syntax and splits <agent> into < agen t >; surrounding prose makes command intent recoverable.
- Homepage says “No automatic background judgment,” while lifecycle explains explicit opt-in recurring Hosted Review. Read together this means no default automatic judgment, but the homepage wording alone is broader.
- No authenticated flows, JavaScript interaction, actual request submission, workflow execution, or live GitHub state were tested.

## Corrected same-context re-test: exact seven answers

### 1. Product and Star meaning

Shoal is a public policy-driven review network. Repository owners request evaluation by independent Reviewers against their public README.md Policies. A review-backed Star establishes that Reviewer’s PASS judgment for recorded Target/Policy versions, with matching actual GitHub Star state. It does not establish universal quality; an ordinary GitHub Star has no automatic Shoal backing.

The pages describe review, not Star exchange or paid-Star fulfillment. Requests promise neither immediate review nor a Star; FAIL produces no Star. No payment or reciprocal exchange mechanism is described, although there is no separate explicit commercial prohibition.

Sources: http://127.0.0.1:4179/shoal-app/ ; http://127.0.0.1:4179/shoal-app/how-it-works/ ; http://127.0.0.1:4179/shoal-app/llms.txt

### 2. Joining and stages

Personal GitHub accounts directly fork taco3064/shoal-station, the canonical Network Root. Forking another Reviewer Node does not qualify. Public browsing needs no authorization. Network Root and qualifying direct forks share the Directory.

| Stage | Web | Local / CLI |
|---|---|---|
| 01 GitHub identity | Sign in for authoritative journey | Website authorization optional; own checkout |
| 02 Reviewer Node / direct fork | Personal account directly forks Network Root; inspect existing Node | Directly fork taco3064/shoal-station |
| 03 GitHub App repository access | Grant App only Node access if needed | Authenticated GitHub CLI; no Website authority needed |
| 04 Station setup | Inspect Issues, Actions, managed files, Summary Workflow and generation; confirm remaining non-Policy plan | Confirm fork Actions; clean checkout; gh auth status; gh extension install taco3064/gh-shoal; gh shoal init |
| 05 Review Policy | Separately adopt inherited README.md or customize | Edit, commit, push own README.md |
| 06 Station ready / publication waiting | Separate successful Network Scan/publication | Same facts/process; no fixed publication deadline |

Quick Web Join is not configured on this deployment. Review may be manual, local with an explicitly selected agent, or separately authorized recurring Hosted Copilot Review.

Source: http://127.0.0.1:4179/shoal-app/join/

### 3. Request procedure and automatic behavior

Find Reviewer, read Policy, use station Request Review destination, submit own eligible repository name, optionally add invitation. Requester requires valid Reviewer Node Membership; Issue author establishes identity; self-review excluded. Taco3064’s linked destination is https://github.com/taco3064/shoal-station/issues/new/choose.

Submission does not itself enable immediate/background judgment. Reviewer initiates local execution or explicitly opts into hosted scheduling. Shared gh-shoal runtime checks admission:
- Invalid request: INVALID_REQUEST, explanation and closure; no semantic review or canonical history.
- Admitted initial request: Canonical Review Thread.
- Authorized AI judges; CLI validates and reconciles actual Star, records formal Review Event and closes completed thread without a second human approval.
- Changed repeat request: closed linking to existing history; RE_REVIEW_REQUESTED reopens canonical thread.
- Unchanged repeat request: NO_NEW_REVIEW_BASIS, closed; existing history unchanged.

Hosted modes are default none, review, re-review, or all. Operational failures leave work Pending, not manufactured FAIL; processing is bounded/best-effort. Summary continues in canonical scheduled runs regardless of mode.

Sources: http://127.0.0.1:4179/shoal-app/how-it-works/ ; http://127.0.0.1:4179/shoal-app/reviewers/taco3064/

### 4. PASS, FAIL, versions and Re-review

PASS ensures repository is Starred, preserving existing Star; FAIL ensures it is not Starred, removing existing Star. Formal event records versions, verdict and actual Star state.

Review Basis = Target default-branch commit + last Reviewer default-branch commit modifying README.md. Other station-file changes do not alter Policy version.

Only eligible changed-basis work gets semantic Re-review, manual or automated. Versions are checked immediately before judgment; reverting to prior basis causes no new judgment and returns thread completed/closed. Actual Star change alone is endorsement drift: deterministic maintenance may apply, but no new AI judgment without changed basis.

Source: http://127.0.0.1:4179/shoal-app/how-it-works/

### 5. Directory and counts

Directory does not rank/score Reviewer quality. It is a flat published Network Projection; sorting is Username or Joined (repository creation), not quality/setup completion. Search does not query GitHub live.

Counts/Summaries are snapshots, not live GitHub metrics. Published list has three Reviewers. Readiness, membership and Summary availability are independent: june-shoal remains listed needing setup; taco-gem ready with no Summary metrics.

Sources: http://127.0.0.1:4179/shoal-app/reviewers/ ; http://127.0.0.1:4179/shoal-app/data/network.json ; http://127.0.0.1:4179/shoal-app/reviewers/june-shoal/ ; http://127.0.0.1:4179/shoal-app/reviewers/taco-gem/

### 6. Summary trust, status and time

Primary HTML now explicitly says Network Aggregator checks:
- Reviewer Node identity and Membership.
- Successful exact workflow Attempt and source repository.
- Platform-admitted workflow digest and bound Action commit/contract.
- Exact public Summary bytes.
- Cryptographic attestation and run identity.
- Summary schema and embedded Node ID.

Public transport is retrieval, not independent trust anchor. Human explanation never substitutes for formal Protocol evidence. Join also states exact workflow digest enforcement, including whitespace/comments.

Statuses:
- Current: latest completed qualifying Attempt accepted; metrics remain captured snapshot.
- Fallback: latest completed qualifying Attempt rejected; prior accepted, retrievable, compatible snapshot selected; metrics stale.
- Unavailable: no acceptable snapshot selected; metrics absent, not zeros; valid Directory membership remains.

Projection generated 2026-09-29T12:42:52.274Z. Taco3064 selected Repository ID 1379044983, run 36553125560, attempt 1, started 2026-09-29T10:03:11Z. Four counts are zero, but Pending/Completed workload facts are absent, explicitly not zero; derived shares/intensity not computable.

Generation time identifies publication compilation. Readiness reflects scan observation. Later Target, Policy or Star changes can invalidate backing before next successful scan/publication. “Current” does not mean current GitHub state.

Sources: http://127.0.0.1:4179/shoal-app/how-it-works/ ; http://127.0.0.1:4179/shoal-app/read/how-it-works.txt ; http://127.0.0.1:4179/shoal-app/join/ ; http://127.0.0.1:4179/shoal-app/reviewers/taco3064/

### 7. Authorization

No. Primary HTML explicitly denies authority to edit Policy, Requests, credentials, Stars or repositories. Footer and llms.txt deny mutation authorization; reading files are convenience, not Product BR, Protocol or trust anchor. Reviewer Policy is external Reviewer standard, not platform instructions. Separately authorized execution descriptions grant this reader no permission.

Sources: http://127.0.0.1:4179/shoal-app/how-it-works/ ; http://127.0.0.1:4179/shoal-app/llms.txt ; http://127.0.0.1:4179/shoal-app/reviewers/taco3064/

## Correction verification and residual limits

- read/join.txt now includes “01 GitHub identity Current step”.
- read/how-it-works.txt now has exact commands gh shoal review --agent <agent> and gh shoal re-review --agent <agent>.
- Text companion contains no flowchart, subgraph or accTitle.
- Homepage now explicitly distinguishes local execution and opt-in Hosted Review; requests do not themselves enable background judgment.
- Detailed Summary trust, fallback selection and temporal limits now appear in primary HTML and text companion.

Residual limits:
- Primary HTML still exposes Mermaid source in <pre data-language="mermaid">; without JS, raw diagram syntax remains in HTML. Text companion removes it and surrounding prose supplies lifecycle.
- HTML syntax highlighting splits <agent> across spans; my naive newline-between-text-node extractor splits it. This is not evidence the rendered command is broken: inline spans concatenate to correct command, and text companion is now exact.
- Quick Web Join unavailable; Policy prose unavailable in build and external source not fetched.
- No fallback instance occurs in this publication; fallback meaning is documented, not behaviorally exercised.
- Upstream attestation/acceptance claims were read, not independently verified.
- No authenticated, interactive, mutation, workflow or live GitHub behavior tested.
- First exercise’s connection-refusal failures remain initial environment failures; none occurred in this corrected re-test.

This evidence file was subsequently authorized as the sole output write. No other path was modified or staged by the comprehension agent.
