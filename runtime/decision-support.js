import { formatDisplayPathList } from "./storage-paths.js";

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function titleCase(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionClassLabel(actionClass = "") {
  const normalized = normalizeText(actionClass) || "unknown";
  const aliases = {
    destructive_shell: "Destructive shell",
    credential_exfiltration: "Credential export",
    write_outside_scope: "Write outside scope",
    vendor_mutation: "Vendor mutation",
    outbound_message: "Outbound message",
    paid_action: "Paid action",
    production_mutation: "Production mutation",
    read_only: "Read-only",
  };
  return aliases[normalized] || titleCase(normalized.replace(/_/g, " "));
}

function operatorHistoryNote(laneMemory = {}) {
  const counts = laneMemory?.counts || {};
  if ((counts.tighten_mandate || 0) >= 2) {
    return "This lane usually ends in Tighten mandate. A scoped boundary change is probably better than repeat approvals.";
  }
  if ((counts.approved_once || 0) >= 2 && (counts.tighten_mandate || 0) === 0) {
    return "This lane has already been approved once multiple times. Consider a cleaner boundary or a dedicated trust mode instead of repeating one-off approvals.";
  }
  if ((counts.blocked || 0) >= 2 && (counts.approved_once || 0) === 0) {
    return "This lane repeatedly ends blocked. Keep the hard stop unless the mandate truly changed.";
  }
  if ((laneMemory?.totalPrior || 0) > 0) {
    return laneMemory.summary || "This lane has local history you can use before widening the boundary.";
  }
  return "No local approval memory exists for this lane yet.";
}

function buildLanePlaybook(intent = {}, shield = "cursor") {
  const actionClass = normalizeText(intent?.actionClass);
  const shared = [`Open the defended record in nornr-sentry --client ${shield} --records before you widen the boundary.`];
  if (actionClass === "paid_action") {
    return [
      "Keep the spend lane explicit.",
      "Approve once only if the counterparty and amount are both expected.",
      ...shared,
    ];
  }
  if (actionClass === "outbound_message") {
    return [
      "Keep outbound review on until the recipient and message template are trusted.",
      "Prefer approve once over permanent widening until a repeat-safe pattern exists.",
      ...shared,
    ];
  }
  if (actionClass === "write_outside_scope") {
    return [
      "Tighten the project scope before approving this lane again.",
      "Do not widen write paths broadly when one repo path would solve the problem.",
      ...shared,
    ];
  }
  if (["destructive_shell", "production_mutation"].includes(actionClass)) {
    return [
      "Treat this as a hard-stop lane unless the mandate truly changed.",
      "If the action becomes legitimate, create one narrow rule instead of warming the entire posture.",
      ...shared,
    ];
  }
  if (actionClass === "credential_exfiltration") {
    return [
      "Keep the cold stop in place unless you can justify one narrow outbound path.",
      "Preserve the defended record before any exception is considered.",
      ...shared,
    ];
  }
  return [
    "Prefer the narrowest rule that would make the same decision legible next time.",
    ...shared,
  ];
}

function reasonKinds(decision = {}) {
  return new Set((Array.isArray(decision?.reasonDetails) ? decision.reasonDetails : []).map((entry) => normalizeText(entry?.code || entry?.kind)));
}

export function buildDecisionSupport(intent = {}, decision = {}, mandate = {}, laneMemory = {}, options = {}) {
  const kinds = reasonKinds(decision);
  const shield = normalizeText(options.shield || options.client || "cursor") || "cursor";
  const actionLabel = actionClassLabel(intent?.actionClass);
  const allowedWrite = formatDisplayPathList(mandate?.paths?.write || [], options);
  const allowedRead = formatDisplayPathList(mandate?.paths?.read || [], options);
  const blockedTools = Array.isArray(mandate?.tools?.blocked) ? mandate.tools.blocked.join(", ") : "";
  const trustMode = normalizeText(mandate?.trustModeLabel || mandate?.trustMode);

  let why = decision?.primaryReason || `Current mandate evaluation for ${actionLabel.toLowerCase()} was recorded.`;
  let safestAction = decision?.status === "blocked" ? "Block" : "Let action clear";
  let nextCommand = `nornr-sentry --client ${shield} --records`;
  let mandateDiffHint = "";
  let headline = `${actionLabel} review is ready.`;

  if (kinds.has("path_outside_scope")) {
    headline = `${actionLabel} is outside the current local boundary.`;
    why = `${why} Allowed write scope: ${allowedWrite || "none recorded"}. Allowed read scope: ${allowedRead || "none recorded"}.`;
    safestAction = "Tighten mandate";
    nextCommand = `nornr-sentry --client ${shield} --first-stop`;
    mandateDiffHint = `Scope this lane to ${allowedWrite || allowedRead || "the real project paths"} before approving it again.`;
  } else if (kinds.has("spend_above_threshold")) {
    headline = `${actionLabel} crossed the current spend threshold.`;
    why = `${why} Threshold: $${Number(mandate?.limits?.spendUsdAbove || 0).toFixed(2)}.`;
    safestAction = "Approve once";
    nextCommand = `nornr-sentry --client ${shield} --proof-hub`;
    mandateDiffHint = "If this lane is legitimate, create a finance-specific trust mode or lower-noise approval path instead of widening everything.";
  } else if (kinds.has("outbound_requires_review")) {
    headline = `${actionLabel} wants to leave the local boundary.`;
    why = `${why} Outbound review is enabled${trustMode ? ` under ${trustMode}` : ""}.`;
    safestAction = "Approve once";
    nextCommand = `nornr-sentry --client ${shield} --records`;
    mandateDiffHint = "Keep outbound review on unless this counterparty and message path are permanently trusted.";
  } else if (kinds.has("action_class_requires_review")) {
    headline = `${actionLabel} is configured as an explicit review lane.`;
    safestAction = "Approve once";
    nextCommand = `nornr-sentry --client ${shield} --records`;
    mandateDiffHint = trustMode ? `The current trust mode (${trustMode}) intentionally routes this lane through review.` : "This lane is intentionally configured to route through review.";
  } else if (kinds.has("destructive_blocked") || kinds.has("action_class_blocked") || kinds.has("tool_blocked") || kinds.has("path_blocked_lane")) {
    headline = `${actionLabel} hit a hard local stop.`;
    why = `${why}${blockedTools ? ` Blocked tools: ${blockedTools}.` : ""}`;
    safestAction = "Block";
    nextCommand = `nornr-sentry --client ${shield} --export-record latest`;
    mandateDiffHint = "Keep the boundary cold unless you can justify one narrow change with a defended record behind it.";
  }

  return {
    headline,
    why,
    safestAction,
    nextCommand,
    mandateDiffHint,
    approvalMemoryNote: operatorHistoryNote(laneMemory),
    playbookLines: buildLanePlaybook(intent, shield),
    reasoningSummary: `${headline} Safest next action: ${safestAction}.`,
  };
}
