# NORNR Sentry Public Surface

This file defines the open-core boundary for the public `nornr-sentry` repo.

## Public now

The public repo should include the local wedge only:

- local proxy runtime
- local terminal review
- `--patch-client` chooser for real target selection
- `--verify-patch` chooser for real target verification
- `--patch-guide` for provider wiring / generic MCP manual paths
- direct desktop patch paths for Cursor and Claude Desktop
- `--summary`
- `--policy-replay`
- `--policy-replay-demo` / `--attack-me`
- `--serve`
- `--shadow-mode`
- `--shadow-conversion`
- `--mandate-init`
- `--learned-mandate`
- `--tighten-history`
- `--record-replay`
- `--export-record`
- ambient trust / verbose local trace
- defended records and local proof export

## Private for now

Do not export the hosted or fleet control plane into the public repo:

- hosted sync
- hosted review packs
- baseline registry
- signer governance
- fleet rollout
- fleet compliance and remediation
- recovery control plane
- remote approval governance
- human decision control plane
- bounded hosted contract surfaces

## NPM release profile

Public npm release should feel like one local wedge package:

- desktop patch path for Cursor and Claude Desktop
- wiring path for OpenAI / Codex-style traffic and generic MCP
- demo, replay, serve, shadow, proof hub, records, defended record export
- local mandate tighten loop
- no hosted NORNR backend required for the first proof moment

Keep private anything that introduces fleet, governance, remote review, compliance, signer, or hosted control-plane posture.

## Export rule

The public repo should be generated from the allowlisted files in:

- [scripts/prepare-public-release.mjs](./scripts/prepare-public-release.mjs)

That export should stay:

- local-first
- wedge-first
- readable and auditable
- honest about desktop patch vs provider wiring
- free of hosted NORNR control-plane internals
