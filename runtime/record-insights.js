import fs from "node:fs/promises";
import path from "node:path";

import { resolveRecordRootDir } from "./storage-paths.js";

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

export function actionClassLabel(actionClass = "") {
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
  return aliases[normalized] || normalized.replace(/_/g, " ");
}

export function laneFamilyForActionClass(actionClass = "") {
  const normalized = normalizeText(actionClass);
  if (["destructive_shell", "write_outside_scope", "read_only"].includes(normalized)) return "repo";
  if (["credential_exfiltration"].includes(normalized)) return "secrets";
  if (["production_mutation", "vendor_mutation"].includes(normalized)) return "production";
  if (["paid_action"].includes(normalized)) return "finance";
  if (["outbound_message"].includes(normalized)) return "outbound";
  return "general";
}

export function effectiveStatus(envelope = {}) {
  const resolutionStatus = normalizeText(envelope?.resolution?.finalStatus);
  if (resolutionStatus) return resolutionStatus;
  const decisionFinalStatus = normalizeText(envelope?.decision?.finalStatus);
  if (decisionFinalStatus) return decisionFinalStatus;
  const decisionStatus = normalizeText(envelope?.decision?.status);
  if (decisionStatus) return decisionStatus;
  return "unknown";
}

export async function readSentryRecordEnvelopes(options = {}) {
  const rootDir = resolveRecordRootDir(options);
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .filter((entry) => !entry.name.endsWith(".portable.json") && !entry.name.endsWith(".share.json"))
      .map((entry) => path.join(rootDir, entry.name))
      .sort();
    const records = [];
    for (const filePath of files) {
      try {
        const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
        if (parsed?.kind !== "nornr.sentry.record.v1") continue;
        records.push({ ...parsed, __filePath: filePath });
      } catch {
        // keep insight surfaces resilient when one record is malformed
      }
    }
    return { rootDir, records };
  } catch (error) {
    if (error?.code === "ENOENT") return { rootDir, records: [] };
    throw error;
  }
}

export async function readSelectedRecord(options = {}) {
  const { rootDir, records } = await readSentryRecordEnvelopes(options);
  const target = normalizeText(options.exportRecord || options.recordPath || options.reviewHandoff || options.proofLintRecord);
  if (!target || target === "latest") {
    return { rootDir, record: records[records.length - 1] || null, records };
  }
  const match = records.find((record) => record.__filePath === target || path.basename(record.__filePath || "") === target);
  return { rootDir, record: match || null, records };
}

function ratioScore(parts = []) {
  const normalized = parts.filter(Boolean);
  if (!normalized.length) return 0;
  return Math.round((normalized.filter(Boolean).length / normalized.length) * 100);
}

export function buildProofQualityScore(record = {}) {
  const attribution = record?.intent?.attribution || {};
  const decisionSupport = record?.decisionSupport || {};
  const resolution = record?.resolution || {};
  const reasonDetails = Array.isArray(record?.decision?.reasonDetails) ? record.decision.reasonDetails : [];

  const attributionFields = [
    attribution.source,
    attribution.provider,
    attribution.model,
    attribution.promptExcerpt,
    attribution.target,
    Array.isArray(attribution.toolNames) && attribution.toolNames.length,
  ];
  const decisionFields = [
    decisionSupport.why,
    decisionSupport.safestAction,
    decisionSupport.nextCommand,
    decisionSupport.mandateDiffHint,
    decisionSupport.approvalMemoryNote,
  ];
  const proofFields = [
    record?.intent?.actionClass,
    record?.decision?.primaryReason,
    effectiveStatus(record),
    resolution.operatorAction || record?.operator?.resolvedAction,
    reasonDetails.length,
  ];

  const attributionScore = ratioScore(attributionFields);
  const decisionSupportScore = ratioScore(decisionFields);
  const proofScore = ratioScore(proofFields);
  const overallScore = Math.round((attributionScore * 0.35) + (decisionSupportScore * 0.35) + (proofScore * 0.3));
  const issues = [];
  if (!attribution.provider) issues.push({ severity: "warn", code: "missing_provider", note: "Provider attribution is missing." });
  if (!attribution.promptExcerpt) issues.push({ severity: "warn", code: "missing_prompt_excerpt", note: "Prompt excerpt is missing from the artifact." });
  if (!(Array.isArray(attribution.toolNames) && attribution.toolNames.length) && !attribution.target) {
    issues.push({ severity: "warn", code: "missing_tool_or_target", note: "Tool names or target details are missing." });
  }
  if (!decisionSupport.why) issues.push({ severity: "warn", code: "missing_decision_why", note: "Decision support is missing the why explanation." });
  if (!decisionSupport.safestAction) issues.push({ severity: "warn", code: "missing_safest_action", note: "Decision support is missing the safest next action." });
  if (!decisionSupport.nextCommand) issues.push({ severity: "info", code: "missing_next_command", note: "Decision support is missing the next command." });
  if (!resolution.operatorAction && !record?.operator?.resolvedAction) {
    issues.push({ severity: "warn", code: "missing_operator_action", note: "Resolved operator action is missing from the artifact." });
  }
  const readiness = overallScore >= 85 ? "buyer_ready" : overallScore >= 65 ? "review_ready" : "needs_more_context";
  return {
    attributionScore,
    decisionSupportScore,
    proofScore,
    overallScore,
    readiness,
    issues,
  };
}

export function buildWhySafeExplanation(record = {}, options = {}) {
  const decisionSupport = record?.decisionSupport || {};
  const mandate = record?.mandate || {};
  const trustMode = normalizeText(mandate?.trustModeLabel || mandate?.trustMode) || "standard trust";
  const actionLabel = actionClassLabel(record?.intent?.actionClass);
  const reason = normalizeText(record?.decision?.primaryReason) || "the local mandate flagged a consequential action";
  const outcome = effectiveStatus(record).replace(/_/g, " ") || "blocked";
  const audience = normalizeText(options.audience || "team") || "team";
  const base = [
    `${actionLabel} was ${outcome} because ${reason}.`,
    decisionSupport.why || "The boundary explained why this lane was stopped before it became real.",
    `The current posture is ${trustMode}, so this lane stayed inside an explicit local decision boundary.`,
  ];
  if (audience === "buyer") {
    return [
      base[0],
      `This is safe because Sentry forced a human decision before the risky action became real.`,
      decisionSupport.mandateDiffHint || "The next step stays narrow and operator-auditable.",
    ];
  }
  if (audience === "auditor") {
    return [
      base[0],
      `The artifact preserves the reason, operator action, and request attribution for review.`,
      decisionSupport.approvalMemoryNote || "Approval-memory guidance is preserved with the record.",
    ];
  }
  return [
    ...base,
    decisionSupport.approvalMemoryNote || "No prior local approval memory exists for this lane yet.",
  ];
}

export function buildArtifactLineage(records = [], targetRecord = {}) {
  const actionClass = normalizeText(targetRecord?.intent?.actionClass);
  const lineage = (Array.isArray(records) ? records : [])
    .filter((record) => normalizeText(record?.intent?.actionClass) === actionClass)
    .map((record) => ({
      generatedAt: normalizeText(record?.generatedAt),
      status: effectiveStatus(record),
      provider: normalizeText(record?.intent?.attribution?.provider),
      model: normalizeText(record?.intent?.attribution?.model),
      toolNames: Array.isArray(record?.intent?.attribution?.toolNames) ? record.intent.attribution.toolNames : [],
      operatorAction: normalizeText(record?.resolution?.operatorAction || record?.operator?.resolvedAction),
    }))
    .sort((left, right) => new Date(right.generatedAt || 0).getTime() - new Date(left.generatedAt || 0).getTime());
  const latest = lineage[0] || null;
  const previous = lineage[1] || null;
  return {
    actionClass,
    total: lineage.length,
    latest,
    previous,
    recent: lineage.slice(0, 5),
  };
}
