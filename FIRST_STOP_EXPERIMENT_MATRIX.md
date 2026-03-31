# NORNR Sentry first-stop experiment matrix

This matrix defines the active copy + CTA experiment on the public Sentry wedge.

## Experiment

- **id:** `sentry-first-stop-hero-v1`
- **page:** `https://nornr.com/nornr-sentry`
- **goal:** improve `page view → first-stop intent` and `first live stop → records opened`

## Variants

| Variant | Promise | Primary CTA | Hypothesis |
| --- | --- | --- | --- |
| `control` | stop-screen first | `Get your first stop` | direct stop-screen language should maximize raw first-stop intent |
| `proof` | proof first | `See your first reviewed stop` | showing one reviewed stop should convert curiosity-heavy traffic better |
| `record` | defended record first | `Get the first defended stop` | durability/proof framing should attract teams that care about audit-grade artifacts |

## Slots under test

- hero headline
- hero lede
- hero primary CTA
- hero secondary CTA
- recommended-first-move block
- records-browser follow-up block

## Success metrics

### Primary

1. `launch.page_view` → `launch.cta_clicked` on first-stop CTAs
2. `install start → first live stop`
3. `first live stop → records opened`

### Supporting

- exact lane opens
- first-stop checklist copies
- records-browser opens after first stop

## Instrumentation

The page now tracks:

- `experimentId`
- `variantId`
- `hypothesis`
- `slot`

The runtime now reports a milestone when the operator opens the real records browser after the first stop:

- `launch.records_opened`
- `/api/public/sentry-record-opened`

## Readout

Check the admin Sentry panel for:

- winner on `view → intent`
- variant-level `first stop → records opened`
- the primary funnel gap if records usage stays cold after activation

## Override

Force a variant locally with:

```text
?nornr=1&sentryVariant=control
?nornr=1&sentryVariant=proof
?nornr=1&sentryVariant=record
```

Only `sentryVariant` matters for the experiment override; the rest of the query can be whatever page state you already need.
