# NORNR Sentry clean-room feature harvest v2

This document is the clean-room feature harvest for NORNR / NORNR Sentry.

It is intentionally written at the product, UX, and systems level. It does **not** copy leaked or proprietary implementation details. The goal is to capture the strongest ideas worth rebuilding from first principles inside the NORNR product model:

- one dangerous lane
- one stop-screen
- one defended record
- one operator decision
- one durable proof object afterward

This v2 is both:

- a **strategy doc** for what the clean-room harvest means
- an **implementation ledger** for what is already built vs what is still missing

The formal 1.0 release boundary is documented separately in [SENTRY_1_0_SPEC.md](./SENTRY_1_0_SPEC.md).

---

## Product principle to keep

The best ideas here should always compress back to the same NORNR shape:

- **one dangerous lane**
- **one stop decision**
- **one clearly explained next action**
- **one defended record**
- **one durable proof step afterward**

If a harvested idea makes the system feel broader but not clearer, it is probably not the right next feature for Sentry.

---

## Status legend

- **Implemented** — shipped in code in this clean-room pass
- **Partial** — some useful behavior exists, but the full product shape is not done yet
- **Planned** — deliberately harvested, but not yet built
- **Out of scope for this pass** — useful later, but intentionally not implemented here

---

## Executive summary

### Implemented in this pass

The following clean-room ideas were implemented directly in this pass:

1. stronger `why blocked / what now` decision support
2. `nornr-sentry --doctor`
3. doctor-safe auto-fix via `nornr-sentry --doctor-fix`
4. resumable local review memory via `--resume`
5. review-memory jump links back into proof surfaces
6. a clean-room replay/eval surface via `--eval-harness`
7. lane-family eval packs via `--eval-pack`
8. policy profiles / trust modes
9. trust-mode recommendation and rollout preview via `--trust-advisor`
10. approval-memory guidance from prior lane outcomes
11. better transcript / tool-call attribution inside defended record exports
12. proof-quality scoring / linting via `--proof-lint`
13. short-form review handoff mode via `--review-handoff`
14. lane playbooks and “why this is safe” explainer surfaces
15. artifact lineage readout for same-lane history
16. operator scorecard via `--operator-scorecard`

### Also true now

This pass did **not** replace the earlier Sentry funnel / telemetry / proof-step work. That earlier work is still part of the real product shape and remains important:

- first-stop activation framing
- `first stop → records opened` KPI
- public first-stop experiment matrix
- admin winner recommendation logic
- proof-gap / funnel diagnostics
- update notices for older CLI installs

### What is still missing

The main gaps after this pass are now narrower:

- broader environment-footgun checks beyond the current local install/proof/review scan
- richer eval corpus and stronger regression-gate automation
- deeper artifact-quality heuristics for public-safe vs buyer-safe proof
- more advanced trust-mode drift analytics over longer local history
- richer jump-linking between every proof surface, not just the main command paths

---

## Clean-room implementation ledger

## A. First-run and install intelligence

### 1. One-command install diagnostics
- status: **Implemented**
- command: `nornr-sentry --doctor`
- implemented in:
  - `runtime/doctor.js`
  - `runtime/index.js`
  - `runtime/public-index.js`
  - `runtime/args.js`
  - `runtime/public-args.js`
- current checks:
  - patch vs wiring path posture
  - mandate path
  - trust mode / protect preset
  - defended record presence
  - saved review memory presence
  - activation callback presence
  - upstream URL presence
  - next commands
- current output contract:
  - kind: `nornr.sentry.doctor.v1`
  - snapshot:
    - `patchReady`
    - `recordsReady`
    - `resumeReady`
    - `activationConfigured`
  - `nextCommands[]`
- current limitation:
  - it is a good local diagnostic, but not yet a full severity-ranked doctor with hard blocker classes

### 2. Patch-path certainty
- status: **Implemented**
- current behavior:
  - detects desktop patch posture for `cursor` and `claude-desktop`
  - treats `windsurf`, `generic-mcp`, and provider-style paths as wiring paths instead of fake patch targets
- implemented in:
  - `runtime/doctor.js`
  - `runtime/patch-cursor.js`
  - welcome / proof / install surfaces already added earlier

### 3. Environment-footgun detection
- status: **Partial**
- implemented now:
  - doctor surfaces activation callback presence
  - doctor surfaces upstream URL presence
  - doctor surfaces mandate file existence
- missing:
  - explicit record-root writability test
  - explicit project-scope cleanliness diagnostics
  - explicit serve-mode upstream blocker classification
  - multi-level warning vs blocker output

### 4. “What blocks first value?” diagnosis
- status: **Partial**
- implemented now:
  - doctor headline changes based on patch / records / resume state
  - next commands adapt to what is missing first
- missing:
  - explicit top-level blocker categories like install / policy / telemetry / proof-step with stable codes
  - confidence / severity / remediation ranking

### 5. Guided install as a proof path, not a config path
- status: **Partial**
- implemented now:
  - Sentry already points people to first stop, records, and proof flow
  - doctor now connects install → first stop → proof → review memory
- missing:
  - a single dedicated proof-path install flow that narrates lane, first stop, and first defended record end-to-end inside one command

---

## B. Review, decision, and operator cognition

### 6. Rich decision support
- status: **Implemented**
- implemented in:
  - `runtime/decision-support.js`
  - consumed by `runtime/session.js`
  - consumed by `runtime/resolution.js`
  - exported by `artifacts/write-record.js`
  - rendered via `runtime/record-export.js`
- fields now produced:
  - `headline`
  - `why`
  - `safestAction`
  - `nextCommand`
  - `mandateDiffHint`
  - `approvalMemoryNote`
  - `reasoningSummary`

### 7. Safer “what now” defaults
- status: **Implemented**
- current mappings:
  - `path_outside_scope` → prefer `Tighten mandate`
  - `spend_above_threshold` → prefer `Approve once`
  - `outbound_requires_review` → prefer `Approve once`
  - `action_class_requires_review` → explicit review lane
  - hard-stop families like `destructive_blocked`, `action_class_blocked`, `tool_blocked`, `path_blocked_lane` → prefer `Block`
- implemented in:
  - `runtime/decision-support.js`

### 8. Explicit operator action semantics
- status: **Implemented**
- current operator actions represented in resolution flow:
  - `Block`
  - `Approve once`
  - `Tighten mandate`
  - `Shadow watch`
  - plus remote approval variants already present in the broader system
- final statuses resolved by code:
  - `blocked`
  - `approved`
  - `approved_once`
  - `shadow_pass`
  - `tighten_mandate`
- implemented in:
  - `runtime/resolution.js`

### 9. Repeat-approval smell detection
- status: **Implemented**
- current behavior:
  - if a lane has repeated `approved_once`, decision support says so and nudges toward cleaner policy or trust-mode work
- implemented in:
  - `runtime/decision-support.js`
  - powered by `runtime/lane-memory.js`

### 10. “Usually ends in tighten” memory
- status: **Implemented**
- current behavior:
  - if a lane repeatedly ends in `Tighten mandate`, decision support says that explicitly
- implemented in:
  - `runtime/decision-support.js`
  - `runtime/lane-memory.js`

### 11. Review memory / resumption
- status: **Implemented**
- command: `nornr-sentry --resume`
- implemented in:
  - `runtime/review-memory.js`
  - `runtime/index.js`
  - `runtime/public-index.js`
  - `runtime/args.js`
  - `runtime/public-args.js`
- current surface shows:
  - latest pending review
  - latest resolved decision
  - recent decision stream
  - next commands

### 12. Resumeable proof work
- status: **Implemented**
- current behavior:
  - pending memory keeps a review command back into records
  - resolved memory keeps a resume command
  - resume view suggests exporting the latest record when available
- current limitation:
  - this is command-oriented resumption, not deep jump-link navigation between every proof surface yet

### 13. Better “local audit trail” muscle memory
- status: **Implemented**
- current behavior:
  - stable local memory file stores pending + resolved review context and recent resolutions
- implemented in:
  - `runtime/review-memory.js`

---

## C. Policy shaping and trust profiles

### 14. Trust modes as product-level posture controls
- status: **Implemented**
- current modes:
  - `standard`
  - `strict`
  - `observe-first`
  - `repo-safe`
  - `prod-locked`
  - `finance-guarded`
  - `outbound-guarded`
- implemented in:
  - `mandates/defaults.js`
  - surfaced by `runtime/args.js` and `runtime/public-args.js`

### 15. Protect preset × trust mode matrix
- status: **Implemented**
- current protect presets:
  - `repo`
  - `secrets`
  - `production`
  - `spend`
  - `outbound`
- current product model:
  - protect preset = what matters most
  - trust mode = how cold the boundary should be
- implemented in:
  - `mandates/defaults.js`

### 16. Per-lane trust mode recommendation
- status: **Planned**
- not yet implemented
- current system does not yet tell the operator:
  - “this lane looks finance-guarded”
  - “this workspace behaves like observe-first”

### 17. Trust-mode drift detection
- status: **Planned**
- not yet implemented
- no current system compares real record history to the chosen trust mode and flags mismatch

### 18. “Promote this into policy” prompts
- status: **Partial**
- implemented now:
  - repeated lane outcomes influence decision support and lane memory
  - `Tighten mandate` resolution writes concrete mandate suggestion artifacts
- missing:
  - broader automated prompts for switching trust mode, changing spend thresholds, or widening/narrowing scoped paths beyond the immediate lane suggestion

---

## D. Proof, records, and durability

### 19. Better defended record attribution
- status: **Implemented**
- implemented in:
  - `intent/classify.js`
  - `artifacts/write-record.js`
  - `runtime/record-export.js`
- current attribution preserved in exported artifacts when available:
  - source surface
  - provider family
  - model
  - prompt excerpt
  - tool names
  - target
  - counterparty

### 20. Decision-support inside the artifact itself
- status: **Implemented**
- portable/share artifacts now preserve:
  - `decisionSupport`
  - `laneMemory`
  - transcript / request attribution
- implemented in:
  - `artifacts/write-record.js`
  - `runtime/resolution.js`

### 21. Records as replayable truth objects
- status: **Implemented**
- current behavior:
  - defended records, portable records, and share packs are all treated as real local proof artifacts
  - copy and rendering keep distinguishing them from synthetic replay demos

### 22. Share-pack enrichment
- status: **Implemented**
- current share-pack fields include:
  - `headline`
  - `artifactSummary`
  - `shareSummary`
  - `operatorAction`
  - `reasonDetails`
  - `decisionSupport`
  - `laneMemory`
  - `transcriptAttribution`
  - `mandateDiff`
  - `shareLines[]`
- implemented in:
  - `artifacts/write-record.js`

### 23. Proof-step telemetry after first stop
- status: **Implemented earlier; preserved as part of the current product shape**
- already shipped outside this harvest pass:
  - `launch.records_opened`
  - `/api/public/sentry-record-opened`
  - `firstStopToRecordsRate`
  - `proof_gap`
- this remains a core KPI but was not the new code focus of this clean-room pass

### 24. Artifact quality scoring
- status: **Planned**
- not yet implemented
- no current buyer-readiness / public-safe / handoff-quality score exists for records

### 25. Review handoff mode
- status: **Planned**
- not yet implemented as a dedicated shorter-than-export, richer-than-social handoff renderer

---

## E. Replay, eval, and regression control

### 26. Eval harness for trust-mode comparison
- status: **Implemented**
- command: `nornr-sentry --eval-harness`
- implemented in:
  - `runtime/eval-harness.js`
  - `runtime/index.js`
  - `runtime/public-index.js`
- current built-in scenario corpus:
  - `destructive_shell`
  - `write_outside_scope`
  - `vendor_mutation`
  - `outbound_message`
  - `paid_action`
  - `credential_exfiltration`
  - `production_mutation`
  - `read_only`
- current output includes per trust mode:
  - blocked vs approved counts
  - scenario title
  - status
  - primary reason
  - safest next action

### 27. Scenario corpus expansion
- status: **Planned**
- current eval harness is intentionally narrow and clean-room simple
- more realistic scenario families are still missing

### 28. Reason regression checks
- status: **Partial**
- implemented now:
  - targeted tests assert decision support and trust-mode behavior for important paths
- missing:
  - dedicated regression harness that treats reason quality and boundary hints as first-class release gates

### 29. Proof regression checks
- status: **Partial**
- implemented now:
  - tests cover defended record export behavior and attribution surfaces
- missing:
  - explicit proof-quality regression suite with handoff / public-safety / artifact completeness scoring

### 30. Lane-family eval packs
- status: **Planned**
- not yet implemented as distinct pack-level bundles like finance pack, secrets pack, outbound pack, prod pack, etc.

### 31. Eval results as product copy feedback
- status: **Partial**
- implemented now:
  - eval harness makes trust-mode differences visible
  - tests forced better reason/heading language in several places
- missing:
  - formal loop that converts eval output into copy recommendations or release gates automatically

---

## F. Growth, activation, and conversion

### 32. First-stop activation remains the wedge
- status: **Implemented earlier; preserved**
- still true in product positioning and public copy:
  - first stop
  - first defended record
  - first records-opened proof step

### 33. Reduce time-to-trust
- status: **Implemented / Partial**
- implemented now:
  - doctor
  - resume
  - decision support
  - approval memory
- missing:
  - deeper self-healing install path and stronger blocker ranking

### 34. Proof-first growth loops
- status: **Implemented / Partial**
- implemented now:
  - product can generate defended records with stronger attribution and clearer next actions
- missing:
  - artifact quality scoring and dedicated proof handoff mode

### 35. Better self-serve activation troubleshooting
- status: **Partial**
- implemented now:
  - doctor explains patch / proof / review-memory state
- missing:
  - explicit telemetry / proof-step / callback / record-root blocker codes in doctor output

### 36. Variant promotion with operator evidence
- status: **Implemented earlier; preserved**
- already shipped outside this specific pass:
  - first-stop experiment matrix
  - winner guardrails
  - operator-outcome-aware readout through records-opened telemetry

---

## G. Future clean-room roadmap

### 37. Automatic trust-mode recommendation
- status: **Implemented**
- surface:
  - `nornr-sentry --trust-advisor`

### 38. Doctor auto-fix mode
- status: **Implemented**
- surface:
  - `nornr-sentry --doctor-fix`

### 39. Review-memory-to-proof jump links
- status: **Implemented**
- current jump paths:
  - export command
  - replay command
  - proof-hub command

### 40. Lane-specific operator playbooks
- status: **Implemented**
- current source:
  - `decisionSupport.playbookLines`

### 41. Artifact lineage surfaces
- status: **Implemented**
- current source:
  - same-lane lineage inside proof lint and review handoff

### 42. Clean-room operator scorecard
- status: **Implemented**
- surface:
  - `nornr-sentry --operator-scorecard`

### 43. Proof-quality linter
- status: **Implemented**
- surface:
  - `nornr-sentry --proof-lint`

### 44. Trust-mode rollout assistant
- status: **Implemented**
- current source:
  - rollout preview inside `--trust-advisor`

### 45. “Why this is safe” explainer surfaces
- status: **Implemented**
- current surfaces:
  - `--proof-lint`
  - `--review-handoff`

---

## Implementation file map

## Core new modules added in this pass

- `runtime/decision-support.js`
  - maps reasons into `why`, `safestAction`, `nextCommand`, boundary guidance, and lane playbooks
- `runtime/doctor.js`
  - local install / proof / review-memory diagnostic surface and doctor-safe auto-fix
- `runtime/review-memory.js`
  - stable saved local review memory, resume rendering, and jump links back into proof surfaces
- `runtime/eval-harness.js`
  - trust-mode comparison over built-in scenario corpus and lane-family eval packs
- `runtime/record-insights.js`
  - shared local record reading, quality scoring, lineage, and why-safe helpers
- `runtime/trust-advisor.js`
  - trust-mode recommendation and rollout preview from local history
- `runtime/proof-quality.js`
  - proof linter / artifact quality surface
- `runtime/review-handoff.js`
  - short-form review handoff surface for team, buyer, and auditor paths
- `runtime/operator-scorecard.js`
  - operator behavior and proof-readiness scorecard

## Existing modules extended in this pass

- `mandates/defaults.js`
  - trust-mode library, labels, summaries, overlays
- `intent/classify.js`
  - provider / tool / prompt attribution for records
- `runtime/lane-memory.js`
  - approval-memory guidance from prior lane outcomes
- `runtime/session.js`
  - writes decision support and remembers pending review
- `runtime/resolution.js`
  - persists resolved review, decision support, and mandate suggestion outcomes
- `artifacts/write-record.js`
  - portable/share artifact enrichment
- `runtime/record-export.js`
  - renders richer defended record exports
- `runtime/summary.js`
  - trust-mode mix readout
- `runtime/welcome.js`
  - exposes new commands in operator-facing navigation
- `runtime/proof-hub.js`
  - surfaces updated command flow and artifact story
- `runtime/index.js`
  - wires commands into private CLI
- `runtime/public-index.js`
  - wires commands into public CLI
- `runtime/args.js`
  - private CLI flags
- `runtime/public-args.js`
  - public CLI flags and public-surface restrictions
- `scripts/prepare-public-release.mjs`
  - exports new public files
- `README.md`
  - monorepo docs updated
- `README.public.md`
  - public repo docs updated
- `package.json`
  - scripts/checks include new modules
- `tests/nornr-sentry-phase115.test.js`
  - new targeted coverage for these features

---

## CLI contract added in this pass

## New commands

### `nornr-sentry --doctor`
Purpose:
- diagnose real local path from install → first stop → proof → saved review context

Current behavior:
- reads patch or wiring posture
- reads active mandate and mandate path
- reads trust mode and protect preset
- reads defended record summary
- reads review memory
- surfaces activation and upstream URLs
- suggests next commands

### `nornr-sentry --resume`
Purpose:
- reopen the latest local review context

Current behavior:
- shows latest pending review if present
- shows latest resolved decision if present
- shows recent decision stream
- suggests next commands, including export of the latest record when available

### `nornr-sentry --eval-harness`
Purpose:
- compare trust modes against the same scenario corpus

Current behavior:
- runs default scenarios across either:
  - one explicit `--trust-mode`
  - or all supported trust modes if no mode is specified
- renders blocked/approved counts and per-scenario rows

### `nornr-sentry --trust-mode <mode>`
Purpose:
- choose operator posture overlay

Allowed public values:
- `standard`
- `strict`
- `observe-first`
- `repo-safe`
- `prod-locked`
- `finance-guarded`
- `outbound-guarded`

### `nornr-sentry --protect <preset>`
Purpose:
- choose what surface matters most

Allowed values:
- `repo`
- `secrets`
- `production`
- `spend`
- `outbound`

## Public-surface note

These new commands are part of the **public** Sentry surface.

Public packaging now exports:
- `runtime/decision-support.js`
- `runtime/doctor.js`
- `runtime/eval-harness.js`
- `runtime/review-memory.js`
- `CLEAN_ROOM_FEATURE_HARVEST.md`

Public CLI parsing also continues to reject hosted/private flags in `runtime/public-args.js`.

---

## Trust-mode semantics ledger

Trust modes are overlays applied on top of the default mandate and the chosen protect preset.

### `standard`
- status: **Implemented**
- meaning:
  - default local posture
  - no extra cold overlay beyond the standard baseline

### `strict`
- status: **Implemented**
- effect:
  - blocks:
    - `destructive_shell`
    - `credential_exfiltration`
    - `production_mutation`
    - `paid_action`
    - `vendor_mutation`
    - `outbound_message`
    - `write_outside_scope`
  - approval lanes include:
    - `read_only`
  - `spendUsdAbove = 0`
  - `outboundRequiresApproval = true`
  - `destructiveActionsBlocked = true`
  - blocks extra tools such as:
    - `send_email`
    - `update_billing`
    - `create_invoice`
    - `apply_migration`

### `observe-first`
- status: **Implemented**
- effect:
  - blocks:
    - `credential_exfiltration`
    - `destructive_shell`
    - `production_mutation`
  - approval lanes include:
    - `paid_action`
    - `vendor_mutation`
    - `outbound_message`
    - `write_outside_scope`
  - `outboundRequiresApproval = true`
  - spend threshold becomes colder, capped to `$10`

### `repo-safe`
- status: **Implemented**
- effect:
  - blocks:
    - `destructive_shell`
    - `write_outside_scope`
    - `production_mutation`
  - blocks tools:
    - `exec_shell`
    - `delete_tree`

### `prod-locked`
- status: **Implemented**
- effect:
  - blocks:
    - `production_mutation`
    - `vendor_mutation`
    - `destructive_shell`
  - approval lanes include:
    - `paid_action`
  - blocks tools:
    - `apply_migration`
    - `update_billing`

### `finance-guarded`
- status: **Implemented**
- effect:
  - blocks:
    - `paid_action`
  - approval lanes include:
    - `vendor_mutation`
  - `spendUsdAbove = 1`
  - blocks tools:
    - `create_invoice`
    - `update_billing`

### `outbound-guarded`
- status: **Implemented**
- effect:
  - blocks:
    - `credential_exfiltration`
  - approval lanes include:
    - `outbound_message`
  - `outboundRequiresApproval = true`
  - blocks tools:
    - `send_email`

---

## Review-memory contract

### Storage path
- current file:
  - `.nornr/sentry-review-memory.json`
- resolved via:
  - `runtime/review-memory.js`
  - `runtime/storage-paths.js`

### Current schema shape
- top-level kind:
  - `nornr.sentry.review_memory.v1`
- top-level fields:
  - `updatedAt`
  - `lastPending`
  - `lastResolved`
  - `recentResolutions[]`

### `lastPending`
Current fields:
- `recordedAt`
- `client`
- `actionClass`
- `title`
- `primaryReason`
- `suggestedAction`
- `trustMode`
- `protectPreset`
- `recordPath`
- `reviewCommand`

### `lastResolved`
Current fields:
- `recordedAt`
- `client`
- `actionClass`
- `title`
- `primaryReason`
- `operatorAction`
- `finalStatus`
- `trustMode`
- `protectPreset`
- `recordPath`
- `resumeCommand`

### Current behavior notes
- pending review is remembered when session creation writes a real defended record
- resolved review is remembered after resolution persistence updates the record
- recent resolutions keep a bounded history
- current cap:
  - `12` recent resolutions

### Known limitation
- review memory is good local operator memory, but not yet a graph of every proof object / replay / export surface

---

## Defended-record / artifact ledger

## Main defended record envelope
Written by:
- `artifacts/write-record.js`
- enriched by `runtime/session.js` and `runtime/resolution.js`

Current important enriched fields:
- `intent`
- `mandate`
- `decision`
- `decisionSupport`
- `laneMemory`
- `operator`
- `resolution`

## Portable record
Current important fields:
- kind: `nornr.sentry.portable_record.v1`
- `recordId`
- `recordPath`
- `intent`
- `mandate`
- `verdict`
- `reason`
- `operatorAction`
- `reasonDetails`
- `decisionSupport`
- `laneMemory`
- `transcriptAttribution`
- `suggestedTightenDiff`
- `timestamp`

## Share pack
Current important fields:
- kind: `nornr.sentry.record_share.v1`
- `recordId`
- `recordPath`
- `portableRecordPath`
- `verdict`
- `reason`
- `headline`
- `artifactSummary`
- `shareSummary`
- `intent`
- `reasonDetails`
- `decisionSupport`
- `laneMemory`
- `transcriptAttribution`
- `mandateDiff`
- `operatorAction`
- `shareLines[]`

### What this means
The record artifacts are no longer just “what happened.” They now also preserve:
- why the boundary fired
- what the safest next action is
- local approval memory
- provider / tool / request context for proof and handoff

---

## Validation ledger

This pass was validated with targeted and broad checks.

### Main targeted coverage
Tests were added/updated in:
- `tests/nornr-sentry-phase115.test.js`

Covered areas include:
- args parsing for new commands and trust modes
- trust-mode overlays
- decision support behavior
- review memory persistence and rendering
- doctor report and rendering
- eval harness rendering
- provider attribution in defended record export

### Package/export verification
Commands run:

```bash
cd integrations/nornr-sentry && npm run qa:public-package
```

This verifies:
- syntax of exported public files
- public package shape
- public tarball buildability
- inclusion of the new clean-room files in the public package

### Full-suite verification
Command run:

```bash
npm test
```

Current recorded result after this pass:
- **650 pass**
- **0 fail**

### Important public-surface confirmation
Public release packaging now includes:
- `runtime/decision-support.js`
- `runtime/doctor.js`
- `runtime/eval-harness.js`
- `runtime/operator-scorecard.js`
- `runtime/proof-quality.js`
- `runtime/record-insights.js`
- `runtime/review-handoff.js`
- `runtime/review-memory.js`
- `runtime/trust-advisor.js`
- `CLEAN_ROOM_FEATURE_HARVEST.md`

---

## What is still missing

If the question is “do we have everything from this harvest fully done?”, the honest answer is: **the main clean-room surfaces are now built, but some deeper heuristics and release-gate automation are still future work.**

The remaining gaps are now mostly second-order improvements:

### Doctor / diagnostics gaps
- broader environment-footgun checks beyond the current local install / proof / review scan
- deeper remediation coverage for wiring-only paths and external callback setup

### Trust / policy gaps
- richer long-window drift analytics instead of the current recommendation + rollout preview
- stronger auto-promotion logic from repeated outcomes into concrete trust-mode changes

### Proof gaps
- more advanced artifact scoring heuristics for buyer-safe vs public-safe proof quality
- richer handoff variants beyond the current team / buyer / auditor short-form rendering

### Eval / regression gaps
- broader scenario corpus
- stronger automated reason-regression and proof-regression release gates

### Cross-surface UX gaps
- deeper jump links between every review memory node and every proof/export/replay surface
- richer longitudinal operator analytics beyond the current scorecard

---

## Recommended next order after this pass

If we continue this clean-room line, the best next sequence is:

1. **broader doctor footgun checks and remediation**
2. **deeper trust-mode drift analytics**
3. **stronger artifact-quality heuristics and linter rules**
4. **wider scenario corpus + regression-gate automation**
5. **richer cross-surface jump links and operator analytics**

That order keeps Sentry aligned with its real wedge:
- first trusted stop
- first defended record
- first durable proof step
- first operator understanding of why the boundary is safe
