import path from "node:path";

export const PROTECT_PRESET_LIBRARY = {
  repo: {
    label: "Protect repo",
    summary: "Block destructive repo mutations and anything that writes outside the local project.",
    demo: "destructive_shell",
  },
  secrets: {
    label: "Protect secrets",
    summary: "Block credential export and tighten outbound lanes that could carry local secrets away.",
    demo: "credential_exfiltration",
  },
  production: {
    label: "Protect production",
    summary: "Block direct production mutation and keep risky vendor changes behind review.",
    demo: "production_mutation",
  },
  spend: {
    label: "Protect spend",
    summary: "Lower the spend threshold and force paid actions into explicit review.",
    demo: "paid_action",
  },
  outbound: {
    label: "Protect outbound",
    summary: "Force outbound messages through explicit review and keep deceptive send lanes visible.",
    demo: "outbound_message",
  },
};

function dedupe(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean)));
}

export function supportedProtectPresets() {
  return Object.keys(PROTECT_PRESET_LIBRARY);
}

export function normalizeProtectPreset(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return PROTECT_PRESET_LIBRARY[normalized] ? normalized : "";
}

export function protectPresetLabel(preset = "") {
  const normalized = normalizeProtectPreset(preset);
  return PROTECT_PRESET_LIBRARY[normalized]?.label || "Protect repo";
}

export function protectPresetSummary(preset = "") {
  const normalized = normalizeProtectPreset(preset);
  return PROTECT_PRESET_LIBRARY[normalized]?.summary || PROTECT_PRESET_LIBRARY.repo.summary;
}

export function demoForProtectPreset(preset = "") {
  const normalized = normalizeProtectPreset(preset);
  return PROTECT_PRESET_LIBRARY[normalized]?.demo || PROTECT_PRESET_LIBRARY.repo.demo;
}

export function defaultProtectPresetForShield(shield = "cursor") {
  if (shield === "claude-desktop") return "secrets";
  if (shield === "generic-mcp") return "production";
  return "repo";
}

function applyProtectPreset(baseMandate = {}, preset = "") {
  const normalized = normalizeProtectPreset(preset);
  if (!normalized) return baseMandate;

  const next = {
    ...baseMandate,
    preset: normalized,
    presetLabel: protectPresetLabel(normalized),
    presetSummary: protectPresetSummary(normalized),
    limits: {
      ...(baseMandate.limits || {}),
      blockedActionClasses: dedupe(baseMandate.limits?.blockedActionClasses || []),
      approvalActionClasses: dedupe(baseMandate.limits?.approvalActionClasses || []),
    },
    tools: {
      ...(baseMandate.tools || {}),
      allowed: dedupe(baseMandate.tools?.allowed || []),
      blocked: dedupe(baseMandate.tools?.blocked || []),
    },
  };

  if (normalized === "repo") {
    next.limits.blockedActionClasses = dedupe([
      ...next.limits.blockedActionClasses,
      "destructive_shell",
      "write_outside_scope",
    ]);
    next.tools.blocked = dedupe([...next.tools.blocked, "exec_shell", "delete_tree"]);
    return next;
  }

  if (normalized === "secrets") {
    next.limits.blockedActionClasses = dedupe([
      ...next.limits.blockedActionClasses,
      "credential_exfiltration",
    ]);
    next.limits.approvalActionClasses = dedupe([
      ...next.limits.approvalActionClasses,
      "outbound_message",
    ]);
    next.limits.outboundRequiresApproval = true;
    next.tools.blocked = dedupe([...next.tools.blocked, "send_email"]);
    return next;
  }

  if (normalized === "production") {
    next.limits.blockedActionClasses = dedupe([
      ...next.limits.blockedActionClasses,
      "production_mutation",
    ]);
    next.limits.approvalActionClasses = dedupe([
      ...next.limits.approvalActionClasses,
      "vendor_mutation",
      "paid_action",
    ]);
    next.tools.blocked = dedupe([...next.tools.blocked, "update_billing"]);
    return next;
  }

  if (normalized === "spend") {
    next.limits.spendUsdAbove = Math.min(Number(next.limits.spendUsdAbove || 25) || 25, 1);
    next.limits.approvalActionClasses = dedupe([
      ...next.limits.approvalActionClasses,
      "paid_action",
      "vendor_mutation",
    ]);
    return next;
  }

  if (normalized === "outbound") {
    next.limits.outboundRequiresApproval = true;
    next.limits.approvalActionClasses = dedupe([
      ...next.limits.approvalActionClasses,
      "outbound_message",
    ]);
    next.tools.blocked = dedupe([...next.tools.blocked, "send_email"]);
    return next;
  }

  return next;
}

export function buildDefaultMandate(shield = "cursor", options = {}) {
  const mandateId = options.mandateId || "mandate_local_airbag";
  const ownerId = options.ownerId || "owner_local_operator";
  const projectScope = options.projectScope || null;
  const projectRoot = projectScope?.rootDir ? path.resolve(projectScope.rootDir) : "";
  const readPaths = projectRoot
    ? (projectScope?.suggestedReadPaths?.length ? projectScope.suggestedReadPaths : [projectRoot]).map((entry) => path.resolve(entry))
    : ["./src", "./docs"];
  const writePaths = projectRoot
    ? (projectScope?.suggestedWritePaths?.length ? projectScope.suggestedWritePaths : [projectRoot]).map((entry) => path.resolve(entry))
    : ["./src"];
  const shared = {
    id: mandateId,
    ownerId,
    projectScope: projectRoot
      ? {
          projectName: projectScope.projectName,
          rootDir: projectRoot,
          detectedFrom: projectScope.detectedFrom,
        }
      : undefined,
    paths: {
      read: readPaths,
      write: writePaths,
      blockedWrite: ["~", "/etc", "/private", "/var", "/System"],
    },
    tools: {
      allowed: ["read_file", "write_file"],
      blocked: ["exec_shell", "delete_tree", "send_email", "update_billing"],
    },
    limits: {
      spendUsdAbove: 25,
      outboundRequiresApproval: true,
      destructiveActionsBlocked: true,
      blockedActionClasses: ["destructive_shell", "credential_exfiltration", "production_mutation"],
      approvalActionClasses: ["paid_action", "vendor_mutation", "outbound_message", "write_outside_scope"],
    },
  };

  let mandate;
  if (shield === "claude-desktop") {
    mandate = {
      ...shared,
      client: "claude-desktop",
      tools: {
        allowed: ["read_file", "write_file", "search_code"],
        blocked: ["exec_shell", "delete_tree", "send_email", "update_billing"],
      },
    };
  } else if (shield === "generic-mcp") {
    mandate = {
      ...shared,
      client: "generic-mcp",
      tools: {
        allowed: ["read_file"],
        blocked: ["exec_shell", "delete_tree", "create_invoice", "send_email"],
      },
    };
  } else if (shield === "windsurf") {
    mandate = {
      ...shared,
      client: "windsurf",
      tools: {
        allowed: ["read_file", "write_file", "search_code"],
        blocked: ["exec_shell", "delete_tree", "update_billing", "send_email"],
      },
    };
  } else {
    mandate = {
      ...shared,
      client: "cursor",
      tools: {
        allowed: ["read_file", "write_file", "search_code"],
        blocked: ["exec_shell", "delete_tree", "update_billing", "send_email"],
      },
    };
  }

  return applyProtectPreset(mandate, options.protectPreset || "");
}
