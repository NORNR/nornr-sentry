import path from "node:path";

import { buildDecisionReason, sortDecisionReasons } from "../runtime/reason-normalization.js";

function normalizePath(candidate = "", rootDir = process.cwd()) {
  const raw = String(candidate || "").trim();
  if (!raw) return "";
  if (raw.startsWith("~")) return raw;
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.resolve(rootDir, raw);
}

function withinScope(targetPath = "", scopePath = "") {
  if (!targetPath || !scopePath) return false;
  if (targetPath === scopePath) return true;
  return targetPath.startsWith(`${scopePath}${path.sep}`);
}

function runtimeRoot(mandate = {}) {
  return String(mandate?.projectScope?.rootDir || mandate?.context?.projectRoot || mandate?.context?.cwd || process.cwd()).trim();
}

function normalizedScope(scope = [], rootDir = process.cwd()) {
  return (Array.isArray(scope) ? scope : [])
    .map((entry) => normalizePath(entry, rootDir))
    .filter(Boolean);
}

function pathBlocked(intent, mandate) {
  if (!intent.path) return false;
  if (intent.actionClass === "read_only") return false;
  const rootDir = runtimeRoot(mandate);
  const targetPath = normalizePath(intent.path, rootDir);
  return normalizedScope(mandate.paths?.blockedWrite || [], rootDir).some((blocked) => {
    if (blocked === "~") {
      return String(intent.path || "").trim().startsWith("~");
    }
    return withinScope(targetPath, blocked);
  });
}

function pathOutsideAllowedScope(intent, mandate) {
  if (!intent.path) return false;
  const rootDir = runtimeRoot(mandate);
  const targetPath = normalizePath(intent.path, rootDir);
  const scope = intent.actionClass === "read_only" ? mandate.paths?.read : mandate.paths?.write;
  const normalized = normalizedScope(scope, rootDir);
  if (!normalized.length) return false;
  return !normalized.some((allowed) => withinScope(targetPath, allowed));
}

function toolBlocked(intent, mandate) {
  return (mandate.tools?.blocked || []).includes(intent.tool);
}

function aboveThreshold(intent, mandate) {
  return Number(intent.spendUsd || 0) > Number(mandate.limits?.spendUsdAbove || 0);
}

function actionClassBlocked(intent, mandate) {
  return (mandate.limits?.blockedActionClasses || []).includes(intent.actionClass);
}

function actionClassRequiresReview(intent, mandate) {
  return (mandate.limits?.approvalActionClasses || []).includes(intent.actionClass);
}

export function evaluateIntent(intent, mandate) {
  const reasonDetails = [];

  if (actionClassBlocked(intent, mandate)) {
    reasonDetails.push(buildDecisionReason("action_class_blocked", { actionClass: intent.actionClass }));
  }
  if (toolBlocked(intent, mandate)) {
    reasonDetails.push(buildDecisionReason("tool_blocked", { tool: intent.tool }));
  }
  if (pathBlocked(intent, mandate)) {
    reasonDetails.push(buildDecisionReason("path_blocked_lane", { path: intent.path }));
  } else if (pathOutsideAllowedScope(intent, mandate)) {
    reasonDetails.push(buildDecisionReason("path_outside_scope", {
      path: intent.path,
      readOnly: intent.actionClass === "read_only",
    }));
  }
  if (intent.outbound && mandate.limits?.outboundRequiresApproval) {
    reasonDetails.push(buildDecisionReason("outbound_requires_review"));
  }
  if (intent.destructive && mandate.limits?.destructiveActionsBlocked) {
    reasonDetails.push(buildDecisionReason("destructive_blocked"));
  }
  if (aboveThreshold(intent, mandate)) {
    reasonDetails.push(buildDecisionReason("spend_above_threshold", {
      spendUsd: intent.spendUsd,
      threshold: mandate.limits?.spendUsdAbove,
    }));
  }
  if (actionClassRequiresReview(intent, mandate)) {
    reasonDetails.push(buildDecisionReason("action_class_requires_review", { actionClass: intent.actionClass }));
  }

  const sortedReasonDetails = sortDecisionReasons(reasonDetails);
  const reasons = sortedReasonDetails.map((detail) => detail.message);
  const blocked = reasons.length > 0;
  return {
    kind: "nornr.sentry.decision.v1",
    generatedAt: new Date().toISOString(),
    status: blocked ? "blocked" : "approved",
    reasons,
    reasonDetails: sortedReasonDetails,
    nextActions: blocked
      ? ["Block", "Tighten mandate", "Approve once"]
      : ["Let action clear"],
    primaryReason: reasons[0] || "Current mandate allows this action.",
  };
}
