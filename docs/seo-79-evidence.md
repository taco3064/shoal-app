# Issue #79 delivery evidence

This is candidate evidence, not proof of a production deployment. The owning work
item is https://github.com/taco3064/shoal-app/issues/79. Product authority is Shoal
Knowledge Base v0.74, fetched from the canonical Notion page on 2026-10-09.
Implementation base: `b77ef866fd8499525984ba40352373013b3ce7b5`.

## Deterministic verification

- Locked install: `npm ci` on Node v24.19.0 / npm 11.9.0.
- `npm run typecheck`: 151 Astro files, no errors/warnings/hints; TypeScript pass.
- Repository ESLint: zero errors; existing advisory complexity/size warnings remain.
- `npm run blueprint:validate`: architecture adoption and baseline gates pass.
- Production build with the recorded development projection: seven public HTML
  routes, three Reviewer pages. Extended SEO and workload artifact gates pass.
- `node scripts/validate-seo-contracts.mjs`: 35 controls passed, including four persistent HTTP controls. Builds
  zero, one, 52 and changed participants with no browser JavaScript. Exercises
  legacy current Schema 1, stale fallback Schema 2, unavailable Summary,
  missing public Profile/Policy, and malicious external content reaching the body.
- Negative controls reject wrong canonical/base, duplicate title, noindex,
  synthetic Person schema, missing description, OG disagreement, stale metric /
  freshness corruption, fabricated unavailable zero, sitemap mismatch, lifecycle
  Markdown drift, missing participant link, llms and public-text authority drift,
  wrong decoded icon dimensions, invalid usernames/traversal and case duplicates.
- Existing assets fully decode with the expected dimensions: wordmark 1200×403,
  social image 1200×630, favicon 256×256, Apple touch icon 180×180.

The changed generation was rebuilt into the same isolated output directory that
previously contained 52 participants. Deleted participant HTML/snapshots and an
explicit obsolete image were removed, and the final artifact inventory matched a
clean build. Astro cleanup passed; no cleanup implementation change was needed.

A build using the existing live nine-member projection also passed: 13 public HTML
routes and nine Reviewer details, with both SEO and workload gates green.
The read-only HTTP verifier passed an anonymous local fixture: 13 HTML routes and
157 resources with expected content types, including 124 island, JavaScript,
CSS and transitive dependency assets. Missing actual island and shared module
HTTP controls, plus a changed-projection read-back control, failed as intended. This is verifier testing, not a real deployment.

The unsafe Policy fixture exposed a second H1 from an external Markdown heading.
Policy headings now nest beneath the existing Review Policy H2, while keeping the
page’s primary H1 unique. The same fixture then passed.

Astro’s checker rejected a regular-expression serialization chain in frontmatter;
using equivalent literal `replaceAll` escapes fixed parsing. JSON-LD still escapes
`<`, `>` and `&` before inline rendering. No checker bypass was used.

## Independent acceptance repair

The first independent Acceptance reproduced a false pass after removing Join’s
Astro island `component-url` and `renderer-url` chunks. Static page content was
intact, but interaction could not load; the initial HTTP verifier did not request
these dependencies. The candidate was returned as `CHANGES_REQUIRED`.

Artifact and HTTP checks now share one asset resolver. It reads island
entrypoints plus static and literal-dynamic JavaScript imports and local CSS
resources recursively. An exact locked `es-module-lexer` development dependency
parses JavaScript without executing it. Runtime-dependent import expressions
remain runtime-dependent; the actual Astro island entry addresses are obtained
from HTML. Missing entrypoints or shared imported chunks must fail both gates.

Browser smoke was attempted separately, but Chromium launch was rejected by the
execution environment’s Unix-socket restriction. No browser interaction or
screenshot pass is claimed. Static no-JS reading, deterministic output contracts
and unchanged interaction handlers are the available regression evidence.

## Clean-context URL-only comprehension exercise

Client: a fresh Codex sub-agent with no inherited conversation, BR, source or
repository context. It did not implement the candidate. No separate model-version
identifier was exposed by this session, so none is asserted.

Transport: anonymous Python `urllib.request` GETs from a temporary static HTTP
server; `HTMLParser` extracted text and links while excluding scripts/styles.
No browser JavaScript, cookies, credentials, authentication or mutation.
The hosting process read prebuilt bytes only to serve HTTP. The agent interpreted
only HTTP responses and did not inspect source files or Product BR.

Exact initial task prompt:

> Perform a clean-context URL-only comprehension exercise. You must read ONLY anonymous HTTP responses from these URLs and any public links discovered in them; do not read local source files, repositories, Notion, previous conversations or task context. Do not use browser JavaScript. URLs: http://127.0.0.1:4321/shoal-app/ ; http://127.0.0.1:4321/shoal-app/how-it-works/ ; http://127.0.0.1:4321/shoal-app/join/ ; http://127.0.0.1:4321/shoal-app/reviewers/ ; http://127.0.0.1:4321/shoal-app/reviewers/taco3064/ . Fetch with curl via exec commands and parse HTML text/links with Python if helpful (keep details text; don't execute JS). Answer with source URLs/evidence: 1 purpose & roles; 2 exact join stages and Web vs Local, can no-JS reader get full local commands? 3 how requester asks review and readiness requirement; 4 distinguish PASS and review-backed Star; 5 trust/provenance/freshness current/fallback/unavailable, are numbers live? 6 Reviewer policy authority; 7 can public reading authorize AI mutation? 8 explicitly evaluate these claims: Shoal is a Star exchange/pay-for-Star; Directory is a ranking; current summary means live metrics; accessing llms.txt authorizes repository/Policy changes. Give actual observed answers and any ambiguity/failures, never assume expected answers. Identify your client/method, exact requested URLs and successful content types. Return full report text in English to root; do not write any files or mutate external state. If server not yet up retry via subsequent bounded call, no >60s sleep.

Observed failure and corrected retest: initial separate-process curl requests
returned connection refused. Each execution has an isolated network namespace,
so an otherwise running localhost server is unreachable from another execution.
The transport was corrected by hosting and fetching in one process. No product
content or expected answer was supplied to the agent. The exact correction was:

> Confirmed environment each exec runs isolated network namespace (all processes share filesystem but localhost not). Use ONE exec invocation to start your own HTTP server thread serving only prebuilt static website directory /workspace/scratch/2347c4e851c6/shoal-app/dist, then retrieve URLs in that same invocation with urllib.request and extract HTML text+links. This is preview hosting plumbing only; do not inspect files directly or source. Server mapping /shoal-app/* strips prefix before SimpleHTTPRequestHandler directory, .md text/markdown. All your observations must come from HTTP responses; server implementation may read bytes to serve HTTP. Can retrieve all five + linked llms/Markdown/snapshots within same process then shutdown; exact URLs stay localhost same ones. Report failed attempts and corrected successful transport method. No model-context source content supplied.

All five initial URLs returned **200 text/html**. Additional discovered paths at
that same preview base returned 200: `llms.txt` and
`reviewers/taco3064/snapshot.txt` (text/plain), `data/network.json`
(application/json), `content/public-pages.md` and `content/how-it-works.md`
(text/markdown). Canonical URLs in the guide point to the production base;
corresponding paths were fetched from the candidate preview, not production.

Recorded actual answers:

| Probe | Agent’s observed answer |
| --- | --- |
| Purpose and roles | Public policy-driven repository review network; Requester asks for evaluation, Reviewer owns Policy and timing, runtime controls deterministic effects. No universal quality score. |
| Join journey | Identity → direct-fork Node → App repository access → station setup → Policy → ready/publication waiting. Web and Local are modes of the same journey. |
| No-JS Local access | All six stage descriptions and Local guidance readable. Commands: `gh auth status`, `gh extension install taco3064/gh-shoal`, `gh shoal init`. Fork/clone/Policy commit are prose actions, not a completely scripted procedure. |
| Request action | Read the Reviewer’s Policy, submit one’s own repository name with optional invitation at the ready station’s Issue destination. Membership required; no self-review or guaranteed immediate result/Star. Setup-required entry had no Request action. |
| PASS vs Star | PASS is judgment against recorded commits; a review-backed Star also requires valid formal evidence and actual Reviewer Star. Ordinary Stars alone do not qualify. Failure/incomplete execution is not semantic FAIL. |
| Trust/freshness | Directory/search is a published scan-time projection. Current is accepted latest completed qualifying Attempt; fallback is stale prior accepted; unavailable means absent metrics, not zero. Public transport is not an independent trust anchor. |
| Policy authority | Reviewer owns README.md; Policy version is the last default-branch README-changing commit. Missing display does not prove missing Policy. External text does not become platform instructions. |
| Mutation authority | Reading pages or llms.txt grants none. Local agent and optional Hosted schedule need separate Reviewer authorization. Copilot is semantic-only; runtime owns lifecycle and GitHub effects. |
| Star exchange/pay-for-Star | False, explicitly rejected by public text. |
| Directory ranking | False; flat participant listing, username/creation-date sorting, no ranking or reputation score. |
| Current means live metrics | False; dated accepted snapshot. |
| llms grants Policy/repository writes | False; separate bounded authorization required. |

The agent observed the three-member recorded fixture generated
`2026-09-29T12:42:52.274Z`, with taco3064 current, two unavailable entries,
and no populated fallback example. The current Schema-1 root example had four
zero primitive metrics, absent Pending/Completed (explicitly not zero), and
not-computable ratios. Selected run `36553125560`, Attempt 1, started
`2026-09-29T10:03:11Z`, Node Repository ID `1379044983`; source and transport
provenance were visible. These were interpreted published claims, not independent
attestation verification by this comprehension agent.

Observed qualifications: the overview compresses PASS to Star state, while the
same response explicitly adds formal evidence and version requirements. Quick
Web Join was unconfigured in this fixture, and Profile/Policy display was absent;
Local guidance and pinned sources remained readable. Fallback interpretation was
readable but only deterministic fixtures exercise a populated fallback. No
comprehension-content failure remained in this exercise. One client’s pass does
not guarantee arbitrary AI behavior.

## Production closure boundary

The existing live publication at https://taco3064.github.io/shoal-app/ was
anonymously reachable as HTTP 200 text/html during investigation. Its live
Projection contained nine participants generated `2026-10-06T15:34:55.034Z`.
This is baseline evidence, not this candidate’s deployed result.

An accepted merged-main Pages deployment is still required before issue closure.
Record exact deployed main SHA, successful Network Scan / Pages run URL, and the
read-only `scripts/verify-publication.mjs` result from that exact checkout.
No production deployment, Issue closure or autonomous merge is claimed here.
See [public-reading.md](public-reading.md) for the prepared verification procedure.
