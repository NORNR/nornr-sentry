function stringifyConfig(value) {
  return JSON.stringify(value, null, 2);
}

function buildProviderSnippets(port = 4317) {
  return {
    openai: [
      `export OPENAI_BASE_URL=http://127.0.0.1:${port}/v1`,
      "export NORNR_UPSTREAM_URL=https://api.openai.com",
      "export OPENAI_API_KEY=sk-live-or-local",
      `curl -s -X POST http://127.0.0.1:${port}/v1/responses -H 'content-type: application/json' -d @integrations/nornr-sentry/demo/openai-destructive.json`,
    ].join("\n"),
    anthropic: [
      `export ANTHROPIC_BASE_URL=http://127.0.0.1:${port}`,
      "export NORNR_UPSTREAM_URL=https://api.anthropic.com",
      "export ANTHROPIC_API_KEY=sk-ant-live-or-local",
      `curl -s -X POST http://127.0.0.1:${port}/v1/messages -H 'content-type: application/json' -d @integrations/nornr-sentry/demo/anthropic-secrets.json`,
    ].join("\n"),
  };
}

export function buildClientAdapter(shield = "cursor", options = {}) {
  const mandateId = options.mandateId || "mandate_local_airbag";
  const ownerId = options.ownerId || "owner_local_operator";
  const commandArgs = ["nornr-sentry", "--shield", shield, "--mandate", mandateId, "--owner", ownerId];
  const base = {
    shield,
    ownerId,
    mandateId,
    headline: "Put one dangerous local tool path behind review.",
    baseUrlSnippet: `export OPENAI_BASE_URL=http://127.0.0.1:${options.port || 4317}/v1`,
    providerSnippets: buildProviderSnippets(options.port || 4317),
  };

  if (shield === "claude-desktop") {
    return {
      ...base,
      clientLabel: "Claude Desktop",
      setupCopy: "Point one consequential Claude Desktop MCP lane at NORNR Sentry first.",
      configSnippet: stringifyConfig({
        mcpServers: {
          "nornr-sentry": {
            command: "npx",
            args: commandArgs,
            env: {
              NORNR_OWNER_ID: ownerId,
              NORNR_MANDATE_ID: mandateId,
            },
          },
        },
      }),
    };
  }

  if (shield === "generic-mcp") {
    return {
      ...base,
      clientLabel: "Generic MCP",
      setupCopy: "Route one generic MCP client through NORNR Sentry before the tool call becomes real.",
      configSnippet: stringifyConfig({
        mcpServers: {
          "nornr-sentry": {
            command: "npx",
            args: commandArgs,
          },
        },
      }),
    };
  }

  return {
    ...base,
    clientLabel: "Cursor",
    setupCopy: "Route one dangerous Cursor tool path through NORNR Sentry first.",
    configSnippet: stringifyConfig({
      mcpServers: {
        "nornr-sentry": {
          command: "npx",
          args: commandArgs,
          env: {
            NORNR_OWNER_ID: ownerId,
            NORNR_MANDATE_ID: mandateId,
          },
        },
      },
    }),
  };
}
