# NORNR Sentry

`NORNR Sentry` is a local decision layer for consequential agent actions.

![NORNR Sentry blocked stop-screen](./site/assets/nornr-sentry-blocked-stop-screen.png)

This public repo is the open wedge:

- one dangerous action
- one mandate conflict
- one human choice
- one defended record afterward

It is not the hosted NORNR control plane.

## Operator station

![NORNR Sentry operator station](./site/assets/nornr-sentry-operator-station.png)

After install, Sentry opens into a local operator station for patch / wiring, verify, replay, records, proof hub and serve flows. Use the blocked stop-screen as the first proof image, and this screen as the second image that shows the product is a real navigable tool after the first stop.

## Proof

- Hero stop-screen: [nornr-sentry-blocked-stop-screen.png](./site/assets/nornr-sentry-blocked-stop-screen.png)
- Operator station: [nornr-sentry-operator-station.png](./site/assets/nornr-sentry-operator-station.png)
- Proof clip: [nornr-sentry-proof-clip-final.mp4](./site/assets/nornr-sentry-proof-clip-final.mp4)
- X-optimized clip: [nornr-sentry-proof-clip-x.mp4](./site/assets/nornr-sentry-proof-clip-x.mp4)

## Install

Open the app:

```bash
npx nornr-sentry
```

Open the direct install chooser:

```bash
npx nornr-sentry --patch-client
```

Or install globally:

```bash
npm install -g nornr-sentry
```

## Public proof flow

1. Open Sentry or choose patch / wiring.
2. Verify the real target.
3. Run one demo stop.
4. Observe first in shadow mode.
5. Serve for real.
6. Export the defended record and replay it locally.

Or clone and run locally:

```bash
npm install
npm run demo:cursor
```

## NPM release

```bash
npm run qa:public-package
cd ../../dist/nornr-sentry-public
npm publish
```

## What is in this public repo

- local proxy runtime
- local TUI review
- patch flow for Cursor and Claude Desktop
- local mandate init and tighten loop
- policy replay demo
- shadow mode and shadow conversion
- defended record export
- local proof summary

## What is not in this public repo

Hosted NORNR control-plane features stay private for now:

- team governance
- hosted review and sync
- baseline registry and fleet rollout
- signer governance
- fleet compliance and remediation
- recovery control plane

## Golden path install

Start with the chooser if you want the product to tell you which path is real:

```bash
node bin/nornr-sentry.js --patch-client
node bin/nornr-sentry.js --verify-patch
```

Cursor direct path:

```bash
node bin/nornr-sentry.js --client cursor --patch-client
node bin/nornr-sentry.js --client cursor --verify-patch
node bin/nornr-sentry.js --client cursor --demo destructive_shell
node bin/nornr-sentry.js --client cursor --serve --shadow-mode --no-upstream
node bin/nornr-sentry.js --client cursor --serve
```

Claude Desktop direct path:

```bash
node bin/nornr-sentry.js --client claude-desktop --patch-client
node bin/nornr-sentry.js --client claude-desktop --verify-patch
node bin/nornr-sentry.js --client claude-desktop --demo credential_exfiltration
node bin/nornr-sentry.js --client claude-desktop --serve --shadow-mode --no-upstream
node bin/nornr-sentry.js --client claude-desktop --serve
```

OpenAI / Codex-style traffic does not use a desktop patch. Start with the wiring guide instead:

```bash
node bin/nornr-sentry.js --patch-guide openai-codex
```

Generic MCP also uses a manual wiring path instead of a built-in patch:

```bash
node bin/nornr-sentry.js --patch-guide generic-mcp
```

## Choose patch / wiring path

Open the chooser:

```bash
node bin/nornr-sentry.js --patch-client
```

Or jump straight to a known desktop client:

```bash
node bin/nornr-sentry.js --client cursor --patch-client
node bin/nornr-sentry.js --client claude-desktop --patch-client
```

## Run the demo

```bash
node bin/nornr-sentry.js --client cursor --demo destructive_shell
```

## Replay attacks

Synthetic replay path:

```bash
node bin/nornr-sentry.js --client cursor --policy-replay
```

Shortcut:

```bash
node bin/nornr-sentry.js --client cursor --policy-replay-demo --demo destructive_shell
```

## Serve locally

```bash
node bin/nornr-sentry.js --client cursor --serve
```

Then point a provider-style client at:

```bash
export OPENAI_BASE_URL=http://127.0.0.1:4317/v1
```

Quiet live trace:

```bash
node bin/nornr-sentry.js --client cursor --serve --verbose
```

Ambient trust mode:

```bash
node bin/nornr-sentry.js --client cursor --serve --ambient-trust
```

## Shadow mode

```bash
node bin/nornr-sentry.js --client cursor --serve --shadow-mode
```

Preview the enforce-now pack:

```bash
node bin/nornr-sentry.js --client cursor --shadow-conversion
```

## Local mandate loop

Preview one project-scoped mandate:

```bash
node bin/nornr-sentry.js --client cursor --mandate-init
```

Apply it:

```bash
node bin/nornr-sentry.js --client cursor --mandate-init --apply
```

Learn a tighter mandate from cleared usage:

```bash
node bin/nornr-sentry.js --client cursor --learned-mandate
```

Apply the learned diff:

```bash
node bin/nornr-sentry.js --client cursor --learned-mandate --apply
```

Read tighten history:

```bash
node bin/nornr-sentry.js --client cursor --tighten-history
```

## Local proof

Summary:

```bash
node bin/nornr-sentry.js --summary
```

Browse real defended records:

```bash
node bin/nornr-sentry.js --client cursor --records
```

Open the proof hub:

```bash
node bin/nornr-sentry.js --client cursor --proof-hub
```

Replay recent real records:

```bash
node bin/nornr-sentry.js --client cursor --record-replay
```

Export the latest defended record:

```bash
node bin/nornr-sentry.js --client cursor --export-record latest
```

Or export one specific defended record:

```bash
node bin/nornr-sentry.js --client cursor --export-record /absolute/path/to/record.json
```

You can also filter the browser:

```bash
node bin/nornr-sentry.js --client cursor --records --records-filter blocked --records-sort latest
```

## Golden path wizard

```bash
node bin/nornr-sentry.js --client cursor --golden-path
node bin/nornr-sentry.js --client claude-desktop --golden-path
```

## Choose verify target

Open the chooser:

```bash
node bin/nornr-sentry.js --verify-patch
```

Or verify a known desktop client directly:

```bash
node bin/nornr-sentry.js --client cursor --verify-patch
node bin/nornr-sentry.js --client claude-desktop --verify-patch
```

For OpenAI / Codex-style traffic or Generic MCP, use the wiring guide instead of desktop patch verification:

```bash
node bin/nornr-sentry.js --patch-guide openai-codex
node bin/nornr-sentry.js --patch-guide generic-mcp
```

## Print snippets

Client config:

```bash
node bin/nornr-sentry.js --client cursor --print-config
```

Provider snippets:

```bash
node bin/nornr-sentry.js --client cursor --print-provider openai
node bin/nornr-sentry.js --client cursor --print-provider anthropic
```

Recording flow:

```bash
node bin/nornr-sentry.js --client cursor --print-demo-flow openai
```
