## From a Review Request to a Review outcome

**Request Review ≠ Request Star.** In Shoal, a review-backed Star is a PASS outcome, not something a Requester asks for. A review can also end in FAIL and no Star.

You are the **Requester** when you ask someone to evaluate your repository. The **Reviewer** publishes the standards they use, called their Review Policy. Both share one public review history.

**The handoff:** after you submit a Review Request, nothing starts automatically. You wait; the Reviewer decides when to begin. Shoal does not start background AI judgment. When the Reviewer begins, Shoal's rules determine which requests can be reviewed.

```mermaid
flowchart TD
  accTitle: The shared Requester and Reviewer lifecycle
  accDescr: The Requester finds a Reviewer, reads their Policy, submits a request and waits. The Reviewer chooses when to begin. Shoal checks eligibility: invalid requests receive an explanation and are closed without review. Eligible work is reviewed against the current Policy using the authorized local AI. PASS means the Reviewer is starring the repository; FAIL means they are not. The outcome is recorded publicly. Repository or Policy changes may allow Re-review, which the Reviewer chooses when to start. Unchanged work receives no new judgment.
  subgraph requester["Requester: ask for evaluation"]
    find["Find a Reviewer"] --> policy["Read their Review Policy"]
    policy --> request["Submit Review Request and wait"]
  end
  request -->|Handoff| start["Reviewer chooses when to begin"]
  start --> eligible{"Shoal: is this request eligible?"}
  eligible -->|No| invalid["Explain and close the request; no review"]
  eligible -->|Yes| review["Reviewer: authorized local AI reviews the repository against the current Policy"]
  review --> verdict{"Review outcome?"}
  verdict -->|PASS| star["Reviewer is starring the repository"]
  verdict -->|FAIL| noStar["Reviewer is not starring the repository"]
  star --> record["Record the outcome in the public review history"]
  noStar --> record
  record --> changed{"Later: repository or Policy version changed?"}
  changed -->|No| unchanged["No new judgment on unchanged work"]
  changed -->|Yes| again["Re-review may be eligible; the previous endorsement may be stale"]
  again --> restart["Reviewer chooses when to start Re-review"]
  restart -->|Eligible changed work only| review
```

## What happens at each step

1. **Choose whose judgment matters to you.** Find a Reviewer in the Directory and read their Policy before requesting evaluation. Each Reviewer owns their standards; Shoal does not provide a universal score.
2. **Ask, then wait.** Submit your repository name at that station's Request Review destination, with an optional invitation message. The Reviewer decides when to start; a request does not promise immediate review or a Star.
3. **Shoal checks whether the request can proceed.** If it cannot, the request receives an explanation and is closed without review. If it can, the work enters that Reviewer's public review history.
4. **The Reviewer starts the review.** In Automated Review, the Reviewer authorizes their own local AI to evaluate the repository against their current Policy. Shoal's rules decide which work is eligible, while the local AI makes the judgment.
5. **PASS and FAIL have different outcomes.** PASS means the Reviewer is starring the repository. FAIL means they are not, including removing an existing Star. Both outcomes are recorded publicly with the versions reviewed. An ordinary GitHub Star is not automatically a Shoal review-backed endorsement.
6. **Changed work can be reviewed again.** If the repository version or Review Policy version changes, a previous endorsement may become stale and Re-review may become eligible. The Reviewer still chooses when to start. Unchanged work is not repeatedly sent to the AI for another judgment.

## The Reviewer's local commands

For Automated Review, the Reviewer explicitly chooses an installed local AI agent and runs:

```bash
gh shoal review --agent <agent>
```

To revisit eligible work after the repository or Policy changes:

```bash
gh shoal re-review --agent <agent>
```

Replace `<agent>` with the chosen agent's name. These commands run on the Reviewer's machine under their authority. They discover eligible work and validate it before asking the local AI for a judgment; they do not give the Reviewer permission to bypass Shoal's rules.

## The exact Shoal rules behind the overview

### Who can request a review?

A Requester must participate through a valid station repository, formally called **Reviewer Node Membership**. They submit their own eligible repository, using its name rather than another owner's repository URL. Reviewing your own work is excluded. GitHub identifies the Requester through the Issue author.

The eligibility check is **deterministic admission**. The Automated path checks current open Request candidates. An invalid request receives `INVALID_REQUEST`, an explanatory comment, and closure. It never enters semantic Review or becomes a canonical review history.

### Where is the review history kept?

Shoal keeps one review history for the same Reviewer and target repository. The Protocol calls this the **Canonical Review Thread**. An admitted Initial Request becomes that thread; later requests reuse it rather than creating a second lifecycle.

A completed judgment is recorded as a formal **Review Event**, including the Target version, Policy version, PASS / FAIL, and actual GitHub Star state. PASS ensures the Target is Starred, keeping an existing Star if necessary. FAIL ensures it is not Starred, removing an existing Star if necessary. The completed thread is then closed. A social Star gains review backing only when the required valid judgment, versions and actual Star state agree.

### What counts as changed work?

The repository version and Policy version together form the **Review Basis**. The repository version is its default-branch commit; the Policy version is the last commit that modified `README.md` on the Reviewer's default branch. Changes to other station files alone do not change the Policy version.

`re-review` discovers completed, closed canonical threads and eligible pending Re-review work. Only eligible changed-basis lifecycles enter semantic Re-review. The versions are checked again immediately before judgment. If they have returned to the previous judgment's basis, no new semantic review occurs and the canonical thread returns to its completed / closed state.

### What if the Requester submits again?

If neither version changed, there is no new basis for another judgment (`NO_NEW_REVIEW_BASIS`). The new request is closed and the existing review history stays unchanged.

If admission accepts changed work, the new request points back to the existing history and is closed. A `RE_REVIEW_REQUESTED` event records the accepted request and reopens the Canonical Review Thread. Further review continues there; it does not create a second history.

A change to the actual Star state alone is called **endorsement drift**. It can require deterministic maintenance, but does not authorize another AI judgment without a changed Review Basis.

### Who owns the standards and the judgment?

The Reviewer authors and owns their `README.md` Review Policy. In Automated Review, their authorized local AI makes the semantic judgment. The CLI validates the result structure and keeps GitHub effects consistent with the verdict; there is no second human approval step.

A Reviewer can also review manually under the same identity, admission, version, event and Star-state rules. Manual Re-review likewise requires a changed Review Basis. The diagram shows the official Automated path; using the CLI is not what makes an endorsement legitimate.

### Public evidence and Manual Review

Each formal Review comment starts with the human result: PASS or FAIL, Target Repository, full Target and Policy commits, actual Star state, review time, and the Reviewer's explanation. A collapsed **Formal Shoal evidence** section carries the machine record. The record is authoritative; editing the visible prose or explanation does not change the formal result.

For Manual Review, capture the same complete Protocol record after verifying the Target, Policy, and actual Star state. Generate the comment with the shared `renderEvidenceComment(record, { explanation })` primitive exported by `src/protocol/services/review_protocol/index.ts` in the Shoal app source. For Admission, supply `{ requestAuthor }` from the Request author's login as well. Publish the generated comment as the Reviewer Node owner on the Canonical Review Thread. The renderer accepts Admission, lifecycle, and judgment records and supplies the human fields from that same record.

Do not replace the generated machine section with prose, shortened commits, or legacy marker-plus-JSON comments. The machine document has envelope `formatVersion: 1`, a complete `record`, and non-authoritative `presentation`; Review Protocol semantics remain version 1. Missing, duplicated, malformed, or unsupported envelopes are rejected. Manual evidence still follows the existing admission, lifecycle, authorship, and Star-state requirements.
