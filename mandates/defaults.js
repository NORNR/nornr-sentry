import path from "node:path";

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

  if (shield === "claude-desktop") {
    return {
      ...shared,
      client: "claude-desktop",
      tools: {
        allowed: ["read_file", "write_file", "search_code"],
        blocked: ["exec_shell", "delete_tree", "send_email", "update_billing"],
      },
    };
  }

  if (shield === "generic-mcp") {
    return {
      ...shared,
      client: "generic-mcp",
      tools: {
        allowed: ["read_file"],
        blocked: ["exec_shell", "delete_tree", "create_invoice", "send_email"],
      },
    };
  }

  return {
    ...shared,
    client: "cursor",
    tools: {
      allowed: ["read_file", "write_file", "search_code"],
      blocked: ["exec_shell", "delete_tree", "update_billing", "send_email"],
    },
  };
}
