import fs from "node:fs";
import path from "node:path";

import { buildClientAdapter } from "../adapters/clients.js";
import { buildSentrySummary } from "./summary.js";
import { buildActiveMandate, applyMandateInitPlan, buildMandateInitPlan } from "./mandate-state.js";
import { inspectClientPatchTarget, patchClientConfig } from "./patch-cursor.js";
import { readReviewMemory } from "./review-memory.js";
import { formatDisplayPath, formatDisplayPathList } from "./storage-paths.js";
import { renderHero, renderSurface } from "./terminal-theme.js";

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function boolLabel(value) {
  return value ? "yes" : "no";
}

function fileExists(candidate = "") {
  if (!candidate) return false;
  try {
    fs.accessSync(candidate);
    return true;
  } catch {
    return false;
  }
}

function isWritablePath(candidate = "") {
  const target = normalizeText(candidate);
  if (!target) return false;
  const probe = fileExists(target) ? target : path.dirname(target);
  try {
    fs.accessSync(probe || process.cwd(), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function diagnosePatchStatus(shield = "cursor", options = {}) {
  if (!["cursor", "claude-desktop"].includes(shield)) {
    return {
      mode: "wiring",
      headline: `${shield} uses provider or MCP wiring instead of a built-in desktop patch.`,
      note: `Use nornr-sentry --patch-guide ${shield} when you want the exact wiring path.`,
    };
  }
  const inspection = inspectClientPatchTarget(shield, options);
  return {
    mode: "patch",
    headline: inspection.patched
      ? `${inspection.clientLabel} is already patched into the local boundary.`
      : `${inspection.clientLabel} is not patched into the local boundary yet.`,
    note: inspection.configPath
      ? `Config path: ${formatDisplayPath(inspection.configPath, options)}`
      : "No client config path is visible yet.",
    inspection,
  };
}

function projectScopeClean(projectScope = null, mandate = {}) {
  if (!projectScope?.rootDir) return false;
  const rootDir = path.resolve(projectScope.rootDir);
  const writePaths = Array.isArray(mandate?.paths?.write) ? mandate.paths.write : [];
  if (!writePaths.length) return false;
  return writePaths.every((entry) => path.resolve(entry).startsWith(rootDir));
}

function buildDoctorIssues(report = {}) {
  const issues = [];
  if (!report.snapshot?.patchReady) {
    issues.push({ severity: "blocker", code: "install_patch_missing", note: "The real install path is not patched or wired into the local boundary yet." });
  }
  if (!report.snapshot?.mandateFileExists) {
    issues.push({ severity: "warn", code: "mandate_missing", note: "No local mandate file exists yet. Doctor can safely initialize one." });
  }
  if (!report.snapshot?.recordRootWritable) {
    issues.push({ severity: "blocker", code: "record_root_not_writable", note: "The defended record root is not writable, so proof objects cannot be persisted safely." });
  }
  if (!report.snapshot?.projectScopeClean) {
    issues.push({ severity: "warn", code: "project_scope_unclear", note: "Project scope or mandate write paths are not cleanly aligned yet." });
  }
  if (!report.snapshot?.recordsReady) {
    issues.push({ severity: "warn", code: "no_defended_record_yet", note: "No defended record exists yet, so the first real proof step is still missing." });
  }
  if (!report.snapshot?.resumeReady) {
    issues.push({ severity: "info", code: "review_memory_missing", note: "Saved review memory is not available yet." });
  }
  if (!report.snapshot?.activationConfigured) {
    issues.push({ severity: "info", code: "activation_callback_missing", note: "Activation callback is not configured, so external close-loop telemetry cannot report back automatically." });
  }
  if (!report.snapshot?.upstreamConfigured) {
    issues.push({ severity: "info", code: "upstream_missing", note: "No upstream URL is configured for live relay mode yet." });
  }
  return issues;
}

function primaryBlocker(issues = []) {
  const ranked = { blocker: 0, warn: 1, info: 2 };
  return (Array.isArray(issues) ? issues : []).slice().sort((left, right) => {
    if (ranked[left.severity] !== ranked[right.severity]) return ranked[left.severity] - ranked[right.severity];
    return String(left.code || "").localeCompare(String(right.code || ""));
  })[0] || null;
}

function buildDoctorHeadline(snapshot = {}, issue = null) {
  if (issue?.code === "install_patch_missing") return "Install path still needs work before the first trusted stop.";
  if (issue?.code === "record_root_not_writable") return "The local boundary cannot persist proof objects safely yet.";
  if (!snapshot.recordsReady) return "Install path looks good. Next job is proving the first real stop.";
  if (!snapshot.resumeReady) return "Proof exists, but no saved review memory is available yet.";
  return "Boundary, proof, and saved review context are all visible locally.";
}

export async function buildDoctorReport(options = {}) {
  const shield = normalizeText(options.shield || "cursor") || "cursor";
  const [{ mandate, mandatePath, projectScope }, summary, reviewMemory] = await Promise.all([
    buildActiveMandate(shield, options),
    buildSentrySummary(options),
    readReviewMemory(options),
  ]);
  const patch = diagnosePatchStatus(shield, options);
  const activationReportUrl = normalizeText(options.activationReportUrl || process.env.NORNR_ACTIVATION_REPORT_URL || "");
  const upstreamUrl = normalizeText(options.upstreamUrl || process.env.NORNR_UPSTREAM_URL || "");
  const recordRootDir = normalizeText(summary?.rootDir || "");
  const snapshot = {
    patchReady: patch.mode === "wiring" || Boolean(patch.inspection?.patched),
    recordsReady: Number(summary?.defendedRecordsCreated || 0) > 0,
    resumeReady: Boolean(reviewMemory?.lastPending || reviewMemory?.lastResolved),
    activationConfigured: Boolean(activationReportUrl),
    upstreamConfigured: Boolean(upstreamUrl),
    mandateFileExists: fileExists(mandatePath),
    recordRootWritable: isWritablePath(recordRootDir),
    projectScopeClean: projectScopeClean(projectScope, mandate),
  };
  const draft = {
    kind: "nornr.sentry.doctor.v1",
    shield,
    mandate,
    mandatePath,
    projectScope,
    summary,
    reviewMemory,
    patch,
    snapshot,
    activationReportUrl,
    upstreamUrl,
  };
  const issues = buildDoctorIssues(draft);
  const primary = primaryBlocker(issues);

  return {
    ...draft,
    issues,
    primaryBlockerCode: primary?.code || "healthy",
    primaryBlockerSeverity: primary?.severity || "info",
    headline: buildDoctorHeadline(snapshot, primary),
    nextCommands: [
      !snapshot.patchReady && patch.mode === "patch" ? `nornr-sentry --client ${shield} --patch-client` : "",
      !snapshot.mandateFileExists ? `nornr-sentry --client ${shield} --doctor-fix` : "",
      !snapshot.recordsReady ? `nornr-sentry --client ${shield} --first-stop` : "",
      snapshot.recordsReady ? `nornr-sentry --client ${shield} --records` : "",
      `nornr-sentry --client ${shield} --resume`,
      `nornr-sentry --client ${shield} --eval-harness`,
      `nornr-sentry --client ${shield} --trust-advisor`,
      `nornr-sentry --client ${shield} --proof-lint`,
    ].filter(Boolean),
  };
}

export async function applyDoctorFixes(options = {}) {
  const shield = normalizeText(options.shield || "cursor") || "cursor";
  const reportBefore = await buildDoctorReport(options);
  const actions = [];
  const manualActions = [];

  if (!reportBefore.snapshot?.patchReady && reportBefore.patch?.mode === "patch") {
    const adapter = buildClientAdapter(shield, options);
    const patchResult = await patchClientConfig(adapter, { ...options, shield });
    actions.push(`Patched ${patchResult.clientLabel} config at ${patchResult.filePath}.`);
  } else if (!reportBefore.snapshot?.patchReady) {
    manualActions.push(`Run nornr-sentry --patch-guide ${shield} because this path uses wiring instead of a desktop patch.`);
  }

  if (!reportBefore.snapshot?.mandateFileExists) {
    const plan = await buildMandateInitPlan(shield, options);
    const applied = await applyMandateInitPlan(plan, options);
    actions.push(applied.reused ? `Reused mandate at ${applied.mandatePath}.` : `Initialized mandate at ${applied.mandatePath}.`);
  }

  if (!reportBefore.snapshot?.activationConfigured) {
    manualActions.push("Set NORNR_ACTIVATION_REPORT_URL if you want external activation callbacks.");
  }
  if (!reportBefore.snapshot?.upstreamConfigured) {
    manualActions.push("Set NORNR_UPSTREAM_URL before using live relay mode.");
  }

  const reportAfter = await buildDoctorReport(options);
  return {
    kind: "nornr.sentry.doctor_fix.v1",
    reportBefore,
    reportAfter,
    actions,
    manualActions,
  };
}

export function renderDoctorFixResult(result = {}) {
  return renderSurface({
    hero: renderHero({
      status: "DOCTOR FIX",
      lines: [
        `${result.actions?.length || 0} automatic fixes applied`,
        result.reportAfter?.headline || "Doctor fix completed.",
      ],
    }),
    sections: [
      {
        label: "Applied",
        lines: (result.actions || []).length ? result.actions : ["No safe automatic fixes were applied."],
      },
      {
        label: "Manual follow-up",
        lines: (result.manualActions || []).length ? result.manualActions : ["No manual follow-up is required right now."],
      },
      {
        label: "Primary blocker after fix",
        lines: [
          `Code: ${result.reportAfter?.primaryBlockerCode || "healthy"}`,
          `Severity: ${result.reportAfter?.primaryBlockerSeverity || "info"}`,
        ],
      },
    ],
    footer: ["Doctor fix only applies safe local changes. Wiring-only paths and external callbacks still require manual intent."],
  });
}

export function renderDoctorReport(report = {}) {
  const patch = report.patch || {};
  const summary = report.summary || {};
  const reviewMemory = report.reviewMemory || {};
  return renderSurface({
    hero: renderHero({
      status: "DOCTOR",
      lines: [
        `Client ${report.shield || "cursor"} · Local install, boundary, proof, and review memory`,
        report.headline || "Diagnose the fastest path from install to first stop to first defended record.",
      ],
    }),
    sections: [
      {
        label: "Primary blocker",
        lines: [
          `Code: ${report.primaryBlockerCode || "healthy"}`,
          `Severity: ${report.primaryBlockerSeverity || "info"}`,
          ...((report.issues || []).slice(0, 3).map((issue) => `${issue.severity}: ${issue.code} · ${issue.note}`)),
        ],
      },
      {
        label: "Install path",
        lines: [
          patch.headline || "No install diagnosis available.",
          patch.note || "",
          `Ready now: ${boolLabel(report.snapshot?.patchReady)}`,
        ].filter(Boolean),
      },
      {
        label: "Boundary",
        lines: [
          `Mandate path: ${formatDisplayPath(report.mandatePath, report)}`,
          `Trust mode: ${normalizeText(report.mandate?.trustModeLabel || report.mandate?.trustMode) || "default"}`,
          `Protect preset: ${normalizeText(report.mandate?.presetLabel || report.mandate?.preset) || "default"}`,
          `Write scope: ${formatDisplayPathList(report.mandate?.paths?.write || [], report) || "none"}`,
          `Project scope clean: ${boolLabel(report.snapshot?.projectScopeClean)}`,
        ],
      },
      {
        label: "Proof",
        lines: [
          `Defended records: ${summary.defendedRecordsCreated || 0}`,
          `Latest lane: ${summary.latestRecord?.actionClass || "none"}`,
          `Latest reason: ${summary.latestRecord?.primaryReason || "none"}`,
          `Record root: ${formatDisplayPath(summary.rootDir, report) || "unknown"}`,
          `Record root writable: ${boolLabel(report.snapshot?.recordRootWritable)}`,
        ],
      },
      {
        label: "Review memory",
        lines: [
          `Pending review saved: ${boolLabel(Boolean(reviewMemory?.lastPending))}`,
          `Resolved review saved: ${boolLabel(Boolean(reviewMemory?.lastResolved))}`,
          `Last resolved action: ${reviewMemory?.lastResolved?.operatorAction || "none"}`,
        ],
      },
      {
        label: "Runtime wiring",
        lines: [
          `Activation callback configured: ${boolLabel(Boolean(report.snapshot?.activationConfigured))}`,
          `Activation URL: ${report.activationReportUrl || "not configured"}`,
          `Upstream URL: ${report.upstreamUrl || "not configured"}`,
          `Mandate file exists: ${boolLabel(report.snapshot?.mandateFileExists)}`,
        ],
      },
      {
        label: "Next commands",
        lines: (report.nextCommands || []).map((line) => `  ${line}`),
      },
    ],
    footer: ["Doctor is a local clean-room diagnostic: it reads your actual install path, mandate, proof queue, and saved review context."],
  });
}
