import fs from "node:fs";

import { buildSentrySummary } from "./summary.js";
import { buildActiveMandate } from "./mandate-state.js";
import { inspectClientPatchTarget } from "./patch-cursor.js";
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

function buildDoctorHeadline(snapshot = {}) {
  if (!snapshot.patchReady) return "Install path still needs work before the first trusted stop.";
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
  const snapshot = {
    patchReady: patch.mode === "wiring" || Boolean(patch.inspection?.patched),
    recordsReady: Number(summary?.defendedRecordsCreated || 0) > 0,
    resumeReady: Boolean(reviewMemory?.lastPending || reviewMemory?.lastResolved),
    activationConfigured: Boolean(activationReportUrl),
  };

  return {
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
    headline: buildDoctorHeadline(snapshot),
    nextCommands: [
      !snapshot.patchReady ? `nornr-sentry --client ${shield} --patch-client` : "",
      !snapshot.recordsReady ? `nornr-sentry --client ${shield} --first-stop` : "",
      snapshot.recordsReady ? `nornr-sentry --client ${shield} --records` : "",
      `nornr-sentry --client ${shield} --resume`,
      `nornr-sentry --client ${shield} --eval-harness`,
    ].filter(Boolean),
  };
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
        ],
      },
      {
        label: "Proof",
        lines: [
          `Defended records: ${summary.defendedRecordsCreated || 0}`,
          `Latest lane: ${summary.latestRecord?.actionClass || "none"}`,
          `Latest reason: ${summary.latestRecord?.primaryReason || "none"}`,
          `Record root: ${formatDisplayPath(summary.rootDir, report) || "unknown"}`,
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
          `Mandate file exists: ${boolLabel(fileExists(report.mandatePath))}`,
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
