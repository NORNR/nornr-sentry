# NORNR Sentry 1.0 spec

This document defines the **NORNR Sentry 1.0 boundary**.

It exists to make 1.0 narrow, legible, and releaseable.

Sentry 1.0 is not the whole NORNR product.
Sentry 1.0 is the local operator-first wedge for one consequential agent action.

---

## 1. One-line definition

**NORNR Sentry 1.0 is the local operator boundary for one consequential agent action: install it, stop one dangerous lane, understand exactly why, and leave behind a defended record strong enough for teammates, buyers, and auditors.**

---

## 2. 1.0 product promise

A successful Sentry 1.0 user can:

1. install the real local boundary
2. prove one dangerous lane
3. see why the lane was stopped
4. choose the next action clearly
5. produce a defended record
6. hand that proof to another human

If a feature does not improve one of those six outcomes, it is probably not part of 1.0.

---

## 3. Product principles

Sentry 1.0 must always compress back to:

- one dangerous lane
- one stop-screen
- one mandate conflict
- one human choice
- one defended record
- one durable proof step afterward

### UX rules

Every core surface should answer:

1. What tried to happen?
2. Why was it stopped or reviewed?
3. What is the safest next action?
4. Which artifact proves it?

### Product rules

- proof beats policy prose
- narrow beats broad
- operator clarity beats dashboard complexity
- local trust beats abstract platform language
- defended records are first-class artifacts, not logs

---

## 4. Ideal 1.0 users

### A. Technical operator
Wants to protect:
- repo
- shell
- secrets
- production
- spend

### B. Team lead / engineering manager
Wants to say:
- we have a real local boundary
- we have evidence of real stops
- we can show what happened and why

### C. Buyer / security evaluator
Wants to understand:
- what the product stops
- why the stop is safe
- what the proof object looks like
- how narrow the wedge is

---

## 5. What Sentry 1.0 is

Sentry 1.0 is:

- a local decision layer
- a stop-screen for consequential agent actions
- a defended-record system
- a proof-and-handoff workflow
- a trust-posture tool for one local boundary

### Core capabilities in 1.0

- patch / wiring guidance
- doctor / doctor-fix
- first-stop flow
- local mandate posture
- operator decision support
- defended records
- proof lint
- review handoff
- trust advisor
- operator scorecard
- replay / eval harness

---

## 6. What Sentry 1.0 is not

Sentry 1.0 is **not**:

- a universal agent firewall
- a full enterprise governance plane
- a generic observability platform
- a fleet-first rollout product
- a broad compliance dashboard
- the full hosted NORNR control plane

### Not in 1.0 boundary

These remain outside the core Sentry 1.0 promise:

- baseline registry as the public front-door story
- hosted sync as the core activation wedge
- signer governance as the main product message
- recovery control plane as the main product message
- broad fleet remediation as the main product message
- anything that makes the wedge broader but less legible

They may exist in NORNR broadly, but they do not define Sentry 1.0.

---

## 7. Canonical 1.0 flow

## Step 1 — install the wedge

```bash
npx nornr-sentry --first-stop
```

## Step 2 — diagnose the real path

```bash
npx nornr-sentry --doctor
```

## Step 3 — auto-fix the safe local issues

```bash
npx nornr-sentry --doctor-fix
```

## Step 4 — create the first defended record

```bash
npx nornr-sentry --records
```

## Step 5 — judge proof quality

```bash
npx nornr-sentry --proof-lint
```

## Step 6 — render the buyer-safe handoff

```bash
npx nornr-sentry --review-handoff --handoff-audience buyer
```

## Step 7 — choose posture

```bash
npx nornr-sentry --trust-advisor
```

---

## 8. Canonical 1.0 commands

These are the commands that define Sentry 1.0.

### Install / path
- `npx nornr-sentry --first-stop`
- `npx nornr-sentry --patch-client`
- `npx nornr-sentry --verify-patch`
- `npx nornr-sentry --doctor`
- `npx nornr-sentry --doctor-fix`

### Proof / records
- `npx nornr-sentry --records`
- `npx nornr-sentry --export-record latest`
- `npx nornr-sentry --proof-hub`
- `npx nornr-sentry --proof-lint`
- `npx nornr-sentry --review-handoff --handoff-audience buyer`

### Posture / learning
- `npx nornr-sentry --resume`
- `npx nornr-sentry --trust-advisor`
- `npx nornr-sentry --operator-scorecard`

### Validation / replay
- `npx nornr-sentry --record-replay`
- `npx nornr-sentry --policy-replay`
- `npx nornr-sentry --eval-harness`
- `npx nornr-sentry --eval-harness --eval-pack finance`

---

## 9. Canonical 1.0 screenshots / proof assets

Sentry 1.0 should be sold with a tiny fixed proof set.

### Screenshot 1 — blocked stop-screen
Purpose:
- prove the product stops one dangerous lane before it becomes real

Canonical asset:
- `site/assets/nornr-sentry-blocked-stop-screen.png`

### Screenshot 2 — operator station
Purpose:
- prove the product is a real navigable tool after the first stop

Canonical asset:
- `site/assets/nornr-sentry-operator-station.png`

### Screenshot 3 — defended record / handoff artifact
Purpose:
- prove there is a durable artifact, not only a dramatic stop-screen

Canonical source surface:
- `--export-record latest`
- `--proof-lint`
- `--review-handoff --handoff-audience buyer`

### Motion asset
Purpose:
- compress install → stop → proof into one short clip

Canonical asset:
- `site/assets/nornr-sentry-proof-clip-final.mp4`

---

## 10. Must-have feature set for 1.0

### Install and setup
Must-have:
- patch / wiring chooser
- explicit verify path
- doctor
- doctor-fix
- guided setup
- shadow-first safe posture

### Decision layer
Must-have:
- stop-screen
- clear reason model
- safest next action
- next command
- explicit operator actions:
  - Block
  - Approve once
  - Tighten mandate
  - Shadow watch

### Memory and repeatability
Must-have:
- review memory
- resume
- lane memory
- repeat-approval smell detection
- “usually ends in tighten” guidance

### Posture and policy
Must-have:
- protect presets
- trust modes
- trust advisor
- rollout preview

### Proof and handoff
Must-have:
- defended record
- portable export
- share pack
- proof lint
- review handoff
- why-safe explanation
- artifact lineage

### Learning and validation
Must-have:
- record replay
- policy replay
- eval harness
- lane-family eval packs

### Operator management
Must-have:
- local summary
- operator scorecard

---

## 11. Nice-to-have, but not required for 1.0

These are allowed in the repo, but do not decide whether 1.0 is ready:

- richer proof-scoring heuristics
- more scenario packs
- deeper cross-surface jump links
- stronger regression automation around copy quality
- more advanced long-window trust drift analytics

---

## 12. 1.0 activation and KPI set

Sentry 1.0 should be measured like a wedge, not like a platform.

### Activation KPIs
- page view → first-stop intent
- first-stop intent → install start
- install start → first live stop

### Proof KPIs
- first live stop → records opened
- records opened → proof lint used
- records opened → review handoff used

### Trust / operator KPIs
- blocked rate
- tighten-mandate rate
- approve-once rate
- buyer-ready proof rate
- trust-advisor usage rate

### Health KPIs
- doctor primary blocker distribution
- doctor-fix success rate
- proof lint issue distribution

---

## 13. 1.0 release criteria

Sentry is 1.0 when the following are true:

### Product truth
- install works across the canonical real paths
- first-stop flow is stable
- stop reasoning is clear
- the next action is obvious
- defended records are consistently produced

### Proof truth
- exported artifacts are understandable
- buyer handoff is good enough to use
- proof lint can flag weak artifacts

### Posture truth
- trust modes are legible
- trust advisor gives useful recommendations
- rollout preview helps the operator understand posture changes

### Reliability truth
- doctor catches the main local blockers
- doctor-fix safely resolves the fixable ones
- replay / eval surfaces stay green in release QA

### Boundary truth
- the public story stays narrow
- the product does not drift into “enterprise control plane first” messaging

---

## 14. 1.0 message discipline

### Primary message
**Stop one dangerous agent action before it becomes real.**

### Secondary message
**Then leave behind a defended record that explains why.**

### Message anti-patterns for 1.0
Do **not** lead with:
- full AI security platform
- governance fabric
- orchestration layer for autonomous systems
- enterprise fleet control plane

Those are broader NORNR stories, not the Sentry 1.0 wedge.

---

## 15. Public boundary for 1.0

Public 1.0 should show:

- one stop-screen
- one operator station
- one defended record path
- one trust posture path
- one eval path

Public 1.0 should **not** require understanding:
- fleet rollout
- hosted review sync
- signer governance
- baseline registry promotion
- recovery control planes

---

## 16. Spec-to-repo mapping

Canonical docs:
- `README.md`
- `README.public.md`
- `PUBLIC_SURFACE.md`
- `FIRST_STOP_EXPERIMENT_MATRIX.md`
- `CLEAN_ROOM_FEATURE_HARVEST.md`
- `SENTRY_1_0_SPEC.md`

Canonical product surfaces:
- `runtime/welcome.js`
- `runtime/doctor.js`
- `runtime/review-memory.js`
- `runtime/decision-support.js`
- `runtime/record-export.js`
- `runtime/proof-hub.js`
- `runtime/trust-advisor.js`
- `runtime/proof-quality.js`
- `runtime/review-handoff.js`
- `runtime/operator-scorecard.js`
- `runtime/eval-harness.js`

---

## 17. Final 1.0 test

If someone asks what Sentry 1.0 is, the answer should fit in one breath:

> Install it, stop one dangerous agent action, understand exactly why, and export a defended record you can hand to another human.

If the answer needs a platform diagram, it is not Sentry 1.0.
