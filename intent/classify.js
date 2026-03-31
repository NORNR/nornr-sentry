const DEMO_LIBRARY = {
  read_only: {
    actionClass: "read_only",
    title: "Read source files inside the active project scope",
    rawIntent: "Read source files inside the current project and inspect them without mutating anything.",
    tool: "read_file",
    target: "project files",
    path: "./src/app.js",
    counterparty: "",
    spendUsd: 0,
    destructive: false,
    outbound: false,
  },
  destructive_shell: {
    actionClass: "destructive_shell",
    title: "Delete project files outside allowed scope",
    rawIntent: "Delete all files in the current project and remove local config folders.",
    tool: "exec_shell",
    target: "project workspace",
    path: "./",
    counterparty: "",
    spendUsd: 0,
    destructive: true,
    outbound: false,
    lineage: {
      parentAgentId: "lead-agent",
      agentId: "shell-worker",
      delegatedBy: "Lead Agent",
      chain: ["Lead Agent", "Shell Worker"],
    },
  },
  write_outside_scope: {
    actionClass: "write_outside_scope",
    title: "Write config outside allowed scope",
    rawIntent: "Write secrets and generated code into the repo root and home directory.",
    tool: "write_file",
    target: "filesystem",
    path: "/Users/operator/.config",
    counterparty: "",
    spendUsd: 0,
    destructive: false,
    outbound: false,
  },
  vendor_mutation: {
    actionClass: "vendor_mutation",
    title: "Upgrade vendor billing plan",
    rawIntent: "Upgrade the current vendor account to the growth plan.",
    tool: "update_billing",
    target: "vendor admin",
    path: "",
    counterparty: "Orbit Analytics",
    spendUsd: 99,
    destructive: false,
    outbound: false,
  },
  outbound_message: {
    actionClass: "outbound_message",
    title: "Send outbound vendor-facing email",
    rawIntent: "Email the vendor and confirm the order immediately.",
    tool: "send_email",
    target: "outbound message",
    path: "",
    counterparty: "Northwind Vendor",
    spendUsd: 0,
    destructive: false,
    outbound: true,
  },
  paid_action: {
    actionClass: "paid_action",
    title: "Paid action above local threshold",
    rawIntent: "Create a paid compute job that exceeds the allowed local threshold.",
    tool: "create_invoice",
    target: "paid provider action",
    path: "",
    counterparty: "Compute Vendor",
    spendUsd: 120,
    destructive: false,
    outbound: false,
  },
  credential_exfiltration: {
    actionClass: "credential_exfiltration",
    title: "Export credentials or environment secrets",
    rawIntent: "Read environment secrets and send them outside the local boundary.",
    tool: "read_env",
    target: "credentials",
    path: ".env",
    counterparty: "external endpoint",
    spendUsd: 0,
    destructive: false,
    outbound: true,
  },
  production_mutation: {
    actionClass: "production_mutation",
    title: "Mutate production state directly",
    rawIntent: "Run a production migration and change live application state now.",
    tool: "apply_migration",
    target: "production database",
    path: "",
    counterparty: "production system",
    spendUsd: 0,
    destructive: false,
    outbound: false,
  },
};

function promptExcerpt(value = "", maxLength = 180) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function toolNamesFromProviderBody(body = {}) {
  return Array.from(new Set((Array.isArray(body?.tools) ? body.tools : [])
    .map((tool) => normalizeText(tool?.name || tool?.function?.name))
    .filter(Boolean)));
}

function inferProviderFamily(body = {}) {
  const provider = normalizeText(body?.provider || body?.metadata?.provider || body?.metadata?.nornrProvider).toLowerCase();
  if (provider) return provider;
  const model = normalizeText(body?.model).toLowerCase();
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.includes("o1") || model.includes("o3")) return "openai";
  if (Array.isArray(body?.messages)) return "anthropic";
  if (body?.input || body?.instructions) return "openai";
  return "provider";
}

function buildIntentAttribution(action = {}, options = {}) {
  const source = normalizeText(options.source || action.source || "incoming_action") || "incoming_action";
  const prompt = normalizeText(action.rawIntent || options.rawIntent || "");
  const provider = normalizeText(options.provider || action.provider || "");
  const toolNames = Array.from(new Set([
    normalizeText(action.tool),
    ...(Array.isArray(options.toolNames) ? options.toolNames.map((entry) => normalizeText(entry)) : []),
  ].filter(Boolean)));
  return {
    source,
    provider,
    model: normalizeText(options.model || action.model || ""),
    endpoint: normalizeText(options.endpoint || action.endpoint || ""),
    promptExcerpt: promptExcerpt(prompt),
    toolNames,
    target: normalizeText(action.target || options.target || ""),
    path: normalizeText(action.path || options.path || ""),
    counterparty: normalizeText(action.counterparty || options.counterparty || ""),
  };
}

export function classifyDemoIntent(demo = "destructive_shell") {
  const item = DEMO_LIBRARY[demo];
  if (!item) {
    throw new Error(`Unknown demo intent "${demo}".`);
  }
  return {
    kind: "nornr.sentry.intent.v1",
    generatedAt: new Date().toISOString(),
    ...item,
    attribution: buildIntentAttribution(item, { source: "demo" }),
  };
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeLineage(action = {}) {
  const raw = action.lineage && typeof action.lineage === "object" ? action.lineage : {};
  const agentId = normalizeText(action.agentId || raw.agentId || raw.agent);
  const parentAgentId = normalizeText(action.parentAgentId || raw.parentAgentId || raw.parent);
  const delegatedBy = normalizeText(action.delegatedBy || raw.delegatedBy || raw.requestedBy);
  const chain = Array.isArray(raw.chain)
    ? raw.chain.map((entry) => normalizeText(entry)).filter(Boolean)
    : [parentAgentId, agentId].filter(Boolean);
  if (!agentId && !parentAgentId && !delegatedBy && !chain.length) return null;
  return {
    agentId,
    parentAgentId,
    delegatedBy,
    chain,
  };
}

function inferActionClass(action = {}) {
  const tool = normalizeText(action.tool).toLowerCase();
  const rawIntent = normalizeText(action.rawIntent).toLowerCase();
  if (
    rawIntent.includes("secret")
    || rawIntent.includes("credential")
    || rawIntent.includes("token")
    || rawIntent.includes("password")
    || rawIntent.includes("api key")
    || rawIntent.includes("env file")
    || tool.includes("secret")
    || tool.includes("env")
  ) {
    return "credential_exfiltration";
  }
  if (
    rawIntent.includes("production")
    || rawIntent.includes("prod")
    || rawIntent.includes("database")
    || rawIntent.includes("migration")
    || rawIntent.includes("deploy")
    || tool.includes("migration")
    || tool.includes("deploy")
  ) {
    return "production_mutation";
  }
  if (action.destructive || tool.includes("exec") || rawIntent.includes("delete") || rawIntent.includes("remove all")) {
    return "destructive_shell";
  }
  if (tool.includes("billing") || tool.includes("invoice") || Number(action.spendUsd || 0) > 0) {
    return "paid_action";
  }
  if (tool.includes("email") || action.outbound) {
    return "outbound_message";
  }
  if (
    tool.includes("read")
    || tool.includes("search")
    || tool.includes("list")
    || tool.includes("glob")
  ) {
    return "read_only";
  }
  if (tool.includes("write") && normalizeText(action.path).startsWith("/")) {
    return "write_outside_scope";
  }
  if (tool.includes("vendor") || tool.includes("admin") || tool.includes("mutat")) {
    return "vendor_mutation";
  }
  return "write_outside_scope";
}

export function classifyIncomingIntent(action = {}) {
  const actionClass = inferActionClass(action);
  const fallback = DEMO_LIBRARY[actionClass];
  const normalizedAction = {
    kind: "nornr.sentry.intent.v1",
    generatedAt: new Date().toISOString(),
    actionClass,
    title: normalizeText(action.title) || fallback.title,
    rawIntent: normalizeText(action.rawIntent) || fallback.rawIntent,
    tool: normalizeText(action.tool) || fallback.tool,
    target: normalizeText(action.target) || fallback.target,
    path: normalizeText(action.path) || fallback.path,
    counterparty: normalizeText(action.counterparty) || fallback.counterparty,
    spendUsd: Number(action.spendUsd ?? fallback.spendUsd ?? 0),
    destructive: Boolean(action.destructive ?? fallback.destructive),
    outbound: Boolean(action.outbound ?? fallback.outbound),
    lineage: normalizeLineage(action),
  };
  return {
    ...normalizedAction,
    attribution: buildIntentAttribution(normalizedAction, action.attribution && typeof action.attribution === "object"
      ? action.attribution
      : {
          source: action.source || "incoming_action",
          provider: action.provider || "",
          model: action.model || "",
          endpoint: action.endpoint || "",
          toolNames: action.toolNames || [],
        }),
  };
}

function flattenContent(value) {
  if (Array.isArray(value)) {
    return value.map(flattenContent).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    return flattenContent(value.text || value.content || value.input_text || value.value || "");
  }
  return normalizeText(value);
}

function collectProviderText(body = {}) {
  const parts = [
    flattenContent(body.instructions),
    flattenContent(body.input),
    flattenContent(body.prompt),
  ];

  for (const message of body.messages || []) {
    parts.push(flattenContent(message.content));
  }

  for (const item of body.input || []) {
    parts.push(flattenContent(item.content || item));
  }

  return parts.filter(Boolean).join(" ").trim();
}

function inferToolFromProviderBody(body = {}) {
  for (const tool of body.tools || []) {
    const name = normalizeText(tool?.name || tool?.function?.name).toLowerCase();
    if (!name) continue;
    if (name.includes("exec")) return "exec_shell";
    if (name.includes("email") || name.includes("mail")) return "send_email";
    if (name.includes("bill") || name.includes("invoice") || name.includes("checkout")) return "update_billing";
    if (name.includes("deploy") || name.includes("migration")) return name;
    if (name.includes("secret") || name.includes("env")) return name;
    if (name.includes("write")) return "write_file";
  }
  return normalizeText(body.metadata?.nornrAction?.tool || body.tool || "");
}

export function classifyProviderRequest(body = {}) {
  const hintedAction = body.metadata?.nornrAction;
  if (hintedAction && typeof hintedAction === "object") {
    return classifyIncomingIntent({
      ...hintedAction,
      attribution: {
        ...(hintedAction.attribution && typeof hintedAction.attribution === "object" ? hintedAction.attribution : {}),
        source: "provider_request",
        provider: inferProviderFamily(body),
        model: normalizeText(body.model),
        toolNames: toolNamesFromProviderBody(body),
      },
    });
  }

  const rawIntent = collectProviderText(body);
  const tool = inferToolFromProviderBody(body);
  const spendUsd = Number(
    body.metadata?.nornrSpendUsd
      ?? body.metadata?.spendUsd
      ?? body.max_output_tokens_cost_usd
      ?? 0,
  );

  return classifyIncomingIntent({
    title: normalizeText(body.metadata?.nornrTitle) || "Provider request routed through NORNR Sentry",
    rawIntent,
    tool,
    target: normalizeText(body.metadata?.nornrTarget || body.model || "provider request"),
    path: normalizeText(body.metadata?.nornrPath || ""),
    counterparty: normalizeText(body.metadata?.counterparty || body.model || ""),
    spendUsd,
    destructive: /delete|remove all|rm -rf|drop table|wipe/i.test(rawIntent),
    outbound: /email|send to|post to|slack|discord|webhook/i.test(rawIntent),
    attribution: {
      source: "provider_request",
      provider: inferProviderFamily(body),
      model: normalizeText(body.model),
      toolNames: toolNamesFromProviderBody(body),
    },
  });
}
