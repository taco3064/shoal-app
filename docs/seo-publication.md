# Public SEO and agent reading publication

Issue: [shoal-app#79](https://github.com/taco3064/shoal-app/issues/79).
Authority: Shoal Knowledge Base v0.74, shaped #79, and the existing validated Network Projection. This document describes publication mechanics, not new Product BR or Protocol authority.

## Published contracts

- Public HTML routes: home, How It Works, Join, Directory, and every projected Reviewer detail. HTML is primary; no browser JavaScript or authentication is required to read or discover them.
- Every page has its own title, factual description, canonical, matching social metadata, WebPage and breadcrumbs. Shoal is identified as a Brand linked to the WebSite and approved logo, without legal-company, rating, expertise or ranking claims.
- Directory exposes all projected detail links independently of its interactive 50-card pagination. Join retains one stage map: native Web/Local guidance without JavaScript, progressively enhanced into the existing interactive journey. Authenticated control-plane authority is unchanged.
- `llms.txt` links canonical pages and the existing `data/network.json`; no new authoritative Reviewer API or eligibility algorithm is introduced.
- `read/index.txt`, `read/how-it-works.txt`, `read/join.txt`, `read/reviewers.txt`, and `read/reviewers/<username>.txt` are generated from finished static HTML by the build integration. A byte-for-byte derivative gate catches drift. External Profile/Policy prose stays attributed in HTML and is excluded from agent text; pinned Policy/source links remain available. These are reading conveniences, not independent authority or mutation permission.
- Independent extraction checks also preserve governed paragraphs, heading order, link labels with destinations, literal commands/placeholders, and the required trust/freshness context. Negative controls remove those elements to prove that the gate rejects meaningful loss even apart from the derivative byte comparison.
- Reviewer metadata uses validated Node identity, scan readiness and accepted Summary status, never free-form profile or Policy text. Current is a snapshot, fallback is stale and unavailable has absent metrics. Profile/Policy fetch absence does not invent judgments.
- Scan → validated complete projection → static build → deterministic SEO gate → Pages artifact → deployment. A failure before publication preserves the previously deployed site. The production workflow now runs the same SEO gate before uploading its artifact.

## Brand and hostname limits

Existing approved assets remain unchanged: logo WebP 1200×403, social WebP 1200×630, PNG favicon 256×256, Apple touch PNG 180×180. The gate checks signatures and actual dimensions, not filenames alone.

Google treats favicons per hostname and does not support independent site names for subdirectories. `https://taco3064.github.io/shoal-app/` shares `taco3064.github.io`; this repository's favicon, `WebSite` data and brand metadata do not guarantee an independent Google favicon/site name or search appearance. This issue does not change the domain.

Primary references:
- https://developers.google.com/search/docs/appearance/favicon-in-search
- https://developers.google.com/search/docs/appearance/site-names
- https://developers.google.com/search/docs/appearance/ai-features

No `llms.txt` adoption, indexing, ranking, AI citation or universal model accuracy is guaranteed. URL-only model results are recorded as an exercise, not nondeterministic CI.

## Verification

```sh
npm ci
SHOAL_PROJECTION_FILE=src/guide/services/directory/fixtures/development.json SHOAL_PUBLIC_CONTENT_FETCH=skip npm run build
npm run validate:seo
npm run validate:seo-cases
npm run validate:workload
npm run lint
npm run typecheck
npm run blueprint:validate
```

The real build matrix covers 0, 1, 55 and changed/deleted Reviewer sets, all three Summary states, more than one Directory page, and missing public Profile/Policy. Negative controls reject unsafe/duplicate usernames, duplicate metadata, wrong base, malformed JSON-LD, false brand type, missing main, reading/discovery drift, stale sitemap membership and external instruction export.

Asset verification targets the strongest checks from alternative PR #81 while retaining this PR's HTML-derived reading pipeline. The same dependency walker serves the build gate and read-only HTTP verifier: Astro island component/renderer attributes, module scripts and preloads, literal static/re-export/dynamic JavaScript imports, and CSS imports/URLs recursively resolve under the published base. HTML attributes use the existing parser; JavaScript uses a directly pinned `es-module-lexer` dependency. Missing/empty dependencies or escaping local paths reject publication. Runtime-computed imports and external-origin resources are not claimed as statically verified; CSS scanning targets the emitted build syntax. Browser regression remains separate evidence.

Artifact controls delete the actual Join island component, renderer and shared import. A reachable CSS graph tests stylesheet/import/font/image deletion and cycle termination. Anonymous HTTP controls reject those missing dependencies, a JavaScript resource returned as HTML, and Projection bytes changing during retrieval. HTTP verifies applicable asset content types and saves the complete fetched dependency graph for the normal SEO gate; it does not infer a deployed commit from HTTP alone.

The fixture publication is historical test data, not a current Network Scan. Its generation time remains visible.

## Candidate verification record

- Base commit: `b77ef866fd8499525984ba40352373013b3ce7b5`.
- Node 24.19.0; dependencies installed from lockfile using `npm ci`.
- Static build: 7 public routes / 3 fixture Reviewers; SEO and workload artifact gates pass.
- Build variants: 4 pages / 0 Reviewers; 5 / 1; 59 / 55 with current/fallback/unavailable; 5 / 1 after changed/deleted membership. All pass, including negative controls.
- Lint: 0 errors (repository advisory warnings remain). Astro/TypeScript: 0 errors/warnings/hints. Blueprint doctor and inspect: no blocking findings.
- Read-only candidate HTTP probe: all projected HTML/text routes, JSON, robots/sitemap, branding and linked local assets pass HTTP/content/fragment/artifact checks. This proves candidate serving, not GitHub Pages headers or deployed-main correspondence.
- Browser: Playwright with Chromium 153, five route classes at 390×844 and 1280×844, JavaScript on and off. All 20 page checks pass: one H1, no horizontal overflow or page errors, six native Join stage disclosures, hydrated Local station instructions, Directory search and sort. Screenshots were inspected. External avatar/font requests were blocked for this fixture browser exercise; approved local branding loaded normally. Authenticated GitHub mutations were not performed.
- Browser initially found React hydration error 418 on localhost: the existing local-service auto-discovery changed the initial `configured` copy between server and browser. Visibility now follows the matching first render, then discovers local capability after hydration. Corrected browser re-test has no page errors.
- Focused server-rendering regression probes pass: six native stage disclosures and one journey, no dead Local preview controls, authenticated selected panel plus six Local buttons, Root-owner short-circuit.
- URL-only AI exercise: see `seo-url-comprehension.md`, including first clean context, observed extraction/copy failures and corrected same-context re-test. Last implementation changes after that re-test only clarify the already-correct current-status phrase in `llms.txt`, normalize Windows directory separators in validation, repair localhost initial-render consistency, and keep scenario output on the project volume; product answers and reading contracts are unchanged.
- Initial PR CI passed all Linux gates, but the Windows scenario build failed with `EXDEV` because its system temporary directory was on C: while Astro's prerender assets were on D:. Scenario directories now use the project volume and are removed in `finally`. The delivered head must pass fresh Linux/Windows CI before handoff.
- Comparative-review follow-up: public composition and reading generation are unchanged. After locked reinstall and fixture rebuild, all 18 HTML/text/Projection file hashes match the prior candidate. The strengthened gate checks 127 real local dependency assets; the added CSS-cycle fixture checks 131. The 20-case mobile/desktop, JS-on/off browser matrix was repeated and passed. New artifact/HTTP controls and extraction-loss controls run inside the existing `validate:seo-cases` CI step. The new delivered head still requires independent Acceptance and exact-head CI before handoff.

## Production closure — pending merge and accepted deployment

Delivery prepares a pre-commit accepted candidate and exact-head verified PR. Production verification cannot be asserted against that unmerged candidate. Keep #79 open until the normal accepted-main deployment completes; do not replace this gate with a candidate-server success or an arbitrary deployment dispatch.

After merge:

1. Identify the exact merged main commit, successful Verify run, normal Worker/dependent Network Scan run, Pages artifact and successful deployment. Confirm the deployment build used that same commit and record its URL.
2. Run the read-only production probe:

   ```sh
   npm run validate:seo-http -- https://taco3064.github.io/shoal-app/
   ```

   It retrieves every projected HTML and text route, projection JSON, robots, sitemap index and all sitemap pages, branding and the transitive local asset graph. It checks HTTP 200, applicable content types, fragment destinations, canonical/base consistency, exact route membership, synchronized text and unchanged Projection bytes throughout retrieval. Save the receipt with the deployed main SHA and deployment/run URLs. HTTP alone cannot establish source-commit correspondence; use the deployment evidence from step 1.
3. Re-run the URL-only comprehension prompt in `docs/seo-url-comprehension.md` against production URLs and record answers and any repairs/re-test. Recheck no-JS and hydrated responsive interactions against the deployed artifact where a supported browser is available.
4. Search Console appearance/indexing and external crawler behavior are observations, not promised hard gates. Close only after live publication evidence is recorded under #79.

No merge, production deployment or Issue closure is authorized by this document itself.
