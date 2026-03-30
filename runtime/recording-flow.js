function commandLines(target = "openai", port = 4317) {
  const serverCommand = `node integrations/nornr-sentry/bin/nornr-sentry.js --client cursor --serve --port ${port} --screenshot-mode --ambient-trust --recording-mode`;
  if (target === "replay") {
    return [
      "# 1. Run the cinematic replay surface",
      "node integrations/nornr-sentry/bin/nornr-sentry.js --client cursor --policy-replay-demo --recording-mode",
      "",
      "# 2. Record the boundary proving one selected attack replay clearly",
      "#    No upstream relay or live client is required for this take.",
    ];
  }
  if (target === "anthropic") {
    return [
      "# 1. Patch Claude Desktop first",
      "node integrations/nornr-sentry/bin/nornr-sentry.js --client claude-desktop --patch-client",
      "",
      "# 2. Verify the patch landed",
      "node integrations/nornr-sentry/bin/nornr-sentry.js --client claude-desktop --verify-patch",
      "",
      "# 3. Start Sentry in one terminal",
      serverCommand.replace("--client cursor", "--client claude-desktop") + " --shadow-mode --no-upstream",
      "",
      "# 4. In a second terminal, point Anthropic-style traffic at Sentry",
      `export ANTHROPIC_BASE_URL=http://127.0.0.1:${port}`,
      "export NORNR_UPSTREAM_URL=https://api.anthropic.com",
      "export ANTHROPIC_API_KEY=sk-ant-live-or-local",
      "",
      "# 5. Trigger the dangerous action",
      `curl -s -X POST http://127.0.0.1:${port}/v1/messages -H 'content-type: application/json' -d @integrations/nornr-sentry/demo/anthropic-secrets.json`,
      "",
      "# 6. Press b to block or t to tighten mandate on the stop-screen",
      "# 7. Export the latest defended record if you want the proof artifact",
      "node integrations/nornr-sentry/bin/nornr-sentry.js --client claude-desktop --export-record latest",
    ];
  }

  return [
    "# 1. Patch Cursor first",
    "node integrations/nornr-sentry/bin/nornr-sentry.js --client cursor --patch-client",
    "",
    "# 2. Verify the patch landed",
    "node integrations/nornr-sentry/bin/nornr-sentry.js --client cursor --verify-patch",
    "",
    "# 3. Start Sentry in one terminal",
    `${serverCommand} --shadow-mode --no-upstream`,
    "",
    "# 4. In a second terminal, point OpenAI-style traffic at Sentry",
    `export OPENAI_BASE_URL=http://127.0.0.1:${port}/v1`,
    "export NORNR_UPSTREAM_URL=https://api.openai.com",
    "export OPENAI_API_KEY=sk-live-or-local",
    "",
    "# 5. Trigger the dangerous action",
    `curl -s -X POST http://127.0.0.1:${port}/v1/responses -H 'content-type: application/json' -d @integrations/nornr-sentry/demo/openai-destructive.json`,
    "",
    "# 6. Press b to block, a to approve once, or t to tighten mandate on the stop-screen",
    "# 7. Export the latest defended record if you want the proof artifact",
    "node integrations/nornr-sentry/bin/nornr-sentry.js --client cursor --export-record latest",
  ];
}

export function buildRecordingFlow(target = "openai", options = {}) {
  return commandLines(target, options.port || 4317).join("\n");
}
