# NORNR Sentry clean-room feature harvest

This document is a clean-room feature harvest for NORNR / NORNR Sentry.

It is intentionally written at the product, UX, and systems level. It does **not** copy leaked or proprietary implementation details. The goal is to capture the strongest ideas worth rebuilding from first principles inside the NORNR product model:

- one dangerous lane
- one stop-screen
- one defended record
- one operator decision
- one durable proof object afterward

## What was harvested already in this pass

The following ideas were implemented directly in this pass as clean-room NORNR features:

1. stronger `why blocked / what now` decision support
2. `nornr-sentry --doctor`
3. resumable local review memory via `--resume`
4. a clean-room replay/eval surface via `--eval-harness`
5. policy profiles / trust modes
6. approval-memory guidance from prior lane outcomes
7. better transcript / tool-call attribution inside defended record exports

---

## Feature harvest map

## A. First-run and install intelligence

### 1. One-command install diagnostics
- command: `nornr-sentry --doctor`
- checks patch or wiring path
- checks mandate path and local storage
- checks proof queue presence
- checks saved review memory
- checks activation callback wiring
- outputs concrete next commands instead of generic health text

### 2. Patch-path certainty
- detect whether the user is on Cursor, Claude Desktop, Windsurf, Generic MCP, or provider wiring
- never assume one default install path when the product can detect the real one
- push users into the shortest real path, not the most common path

### 3. Environment-footgun detection
- warn when `NORNR_UPSTREAM_URL` is missing in serve mode
- warn when activation callback is not configured but proof-step telemetry is expected
- warn when the record root is not writable
- warn when the project root cannot be scoped cleanly

### 4. “What blocks first value?” diagnosis
- distinguish:
  - install problem
  - policy problem
  - telemetry problem
  - proof-step problem
- make the primary blocker the first line in doctor output

### 5. Guided install as a proof path, not a config path
- every install surface should answer:
  - what dangerous lane am I about to prove?
  - what is the first stop?
  - where does the first defended record appear?

---

## B. Review, decision, and operator cognition

### 6. Rich decision support
- every blocked/reviewed lane should say:
  - why this was stopped
  - safest next action
  - next command
  - boundary hint
  - approval-memory note

### 7. Safer “what now” defaults
- map reasons into the most likely safe next step:
  - outside scope → `Tighten mandate`
  - spend threshold → `Approve once` or finance trust mode
  - outbound review → `Approve once` with preserved review lane
  - hard stop lane → keep blocked unless sharply justified

### 8. Explicit operator action semantics
- distinguish clearly between:
  - `Block`
  - `Approve once`
  - `Tighten mandate`
  - `Shadow watch`
- show what changes permanently vs what does not

### 9. Repeat-approval smell detection
- if a lane has been approved once repeatedly, say so
- push toward a trust mode or scoped exception instead of repetitive manual behavior

### 10. “Usually ends in tighten” memory
- if a lane repeatedly ends in `Tighten mandate`, say that explicitly
- help the operator promote a pattern into a real boundary

### 11. Review memory / resumption
- `nornr-sentry --resume`
- show:
  - latest pending review
  - latest resolved decision
  - recent decision stream
  - exact next commands

### 12. Resumeable proof work
- after a stop or review, users should be able to resume:
  - the exact record
  - the proof queue
  - the suggested follow-up path
- never make them rediscover the last interesting artifact

### 13. Better “local audit trail” muscle memory
- save recent review outcomes in a stable local file
- turn Sentry from a one-off stop-screen into a repeatable operator console

---

## C. Policy shaping and trust profiles

### 14. Trust modes as product-level posture controls
- current clean-room modes:
  - `standard`
  - `strict`
  - `observe-first`
  - `repo-safe`
  - `prod-locked`
  - `finance-guarded`
  - `outbound-guarded`
- these should become first-class product language, not internal-only knobs

### 15. Protect preset × trust mode matrix
- protect preset says **what area matters most**
- trust mode says **how cold the operator wants the boundary**
- this matrix is easier to reason about than low-level flags alone

### 16. Per-lane trust mode recommendation
- future improvement:
  - “This lane looks like finance-guarded”
  - “This team is behaving like observe-first”
  - “This project is effectively repo-safe today”

### 17. Trust-mode drift detection
- compare real resolved records to the current trust mode
- identify when the current mode is too cold or too permissive for actual behavior

### 18. “Promote this into policy” prompts
- if local evidence shows the same outcome repeating, suggest:
  - switch trust mode
  - add scoped path
  - block one extra tool
  - raise/lower spend boundary

---

## D. Proof, records, and durability

### 19. Better defended record attribution
- every defended record should preserve:
  - source surface
  - provider family
  - model if known
  - prompt excerpt
  - tool names
  - target
  - counterparty if relevant

### 20. Decision-support inside the artifact itself
- the defended record should not only say what happened
- it should also preserve:
  - safest next action
  - boundary hint
  - approval-memory note

### 21. Records as replayable truth objects
- records should be clearly framed as:
  - local proof objects
  - replayable evidence
  - operator memory anchors
- not merely logs or demo payloads

### 22. Share-pack enrichment
- when a proof object is exported, the share pack should include:
  - artifact headline
  - summary reason
  - operator action
  - provider/tool attribution
  - public-safe wording

### 23. Proof-step telemetry after first stop
- the real question is not only “did a stop happen?”
- also ask “did the operator move into the proof object afterward?”
- `first stop → records opened` should stay a core KPI

### 24. Artifact quality scoring
- future improvement:
  - score records for buyer-readiness
  - score whether the proof is public-safe
  - score whether the record has enough context for review handoff

### 25. Review handoff mode
- future improvement:
  - create a dedicated handoff rendering for teammates, buyers, or auditors
  - shorter than the full export
  - richer than a social summary

---

## E. Replay, eval, and regression control

### 26. Eval harness for trust-mode comparison
- `nornr-sentry --eval-harness`
- compare the same dangerous scenarios across trust modes
- show blocked vs approved mix and safest next actions

### 27. Scenario corpus expansion
- future improvement:
  - add more realistic filesystem, spend, outbound, and prod-change cases
  - preserve a narrow wedge but widen test realism

### 28. Reason regression checks
- not just status regression
- also verify:
  - did the right primary reason win?
  - did the right boundary hint show up?
  - did the right next action remain stable?

### 29. Proof regression checks
- future improvement:
  - validate record export shape
  - validate attribution payload quality
  - validate proof-step milestone behavior

### 30. Lane-family eval packs
- future improvement:
  - repo mutation pack
  - secrets pack
  - finance pack
  - production pack
  - outbound pack
- helps users understand posture without manually assembling scenarios

### 31. Eval results as product copy feedback
- use replay/eval surfaces to identify:
  - vague reason language
  - misleading next steps
  - trust modes that are not legible enough

---

## F. Growth, activation, and conversion

### 32. First-stop activation remains the wedge
- keep the public story anchored to:
  - first stop
  - first defended record
  - first records-opened proof step

### 33. Reduce time-to-trust
- the main growth challenge is not awareness
- it is getting users from install to “I understand and trust the boundary” quickly
- doctor, resume, and cleaner decision support all reduce this time

### 34. Proof-first growth loops
- the wedge improves when users can say:
  - “here is the exact stop-screen”
  - “here is the exact record”
  - “here is the lane we defended”
- product surfaces should optimize for that handoff

### 35. Better self-serve activation troubleshooting
- a user who fails should be told exactly why:
  - patch issue
  - no first stop yet
  - proof queue empty
  - review memory not established
  - activation callback missing

### 36. Variant promotion with operator evidence
- public CTA experiments should eventually connect to operator-side outcomes
- best messaging should be what produces:
  - first-stop intent
  - first stop
  - records opened
  - stable review behavior

---

## G. Future clean-room roadmap

### 37. Automatic trust-mode recommendation
- recommend the likely best trust mode based on real local record history
- e.g. “This workspace behaves like finance-guarded.”

### 38. Doctor auto-fix mode
- future improvement:
  - offer fix suggestions interactively
  - patch if safe
  - explain when only manual wiring is possible

### 39. Review-memory-to-proof jump links
- future improvement:
  - resume directly into exact record export
  - exact record replay
  - exact proof-hub recommendation

### 40. Lane-specific operator playbooks
- future improvement:
  - “for paid_action, start here”
  - “for outbound_message, keep review on”
  - “for write_outside_scope, tighten scope before approving”

### 41. Artifact lineage surfaces
- future improvement:
  - delegated agent chain
  - model/provider evolution
  - repeated lane pattern across sessions

### 42. Clean-room operator scorecard
- future improvement:
  - how often the operator tightens vs approves once
  - how often a proof object gets opened/exported
  - how often a trust mode mismatch appears

### 43. Proof-quality linter
- future improvement:
  - ensure records have enough attribution
  - ensure share-pack language is public-safe
  - ensure mandate diffs are preserved when relevant

### 44. Trust-mode rollout assistant
- future improvement:
  - simulate moving from `observe-first` to `repo-safe`
  - show which recent records would change outcome
  - use local records as evidence before rollout

### 45. “Why this is safe” explainer surfaces
- future improvement:
  - translate policy decisions into buyer-safe, operator-safe English
  - useful for proof walls, README examples, and procurement conversations

---

## Product principle to keep

The best ideas here should always compress back to the same NORNR shape:

- **one dangerous lane**
- **one stop decision**
- **one clearly explained next action**
- **one defended record**
- **one durable proof step afterward**

If a harvested idea makes the system feel broader but not clearer, it is probably not the right next feature for Sentry.
