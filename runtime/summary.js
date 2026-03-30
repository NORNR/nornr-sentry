import fs from "node:fs/promises";
import path from "node:path";

import {
  pickByDensity,
  renderHero,
  renderSurface,
  terminalDensityFlags,
} from "./terminal-theme.js";
import { formatDisplayPath, inferProjectScope, resolveRecordRootDir } from "./storage-paths.js";

async function readRecordFiles(rootDir) {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(rootDir, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function effectiveStatus(envelope = {}) {
  const resolutionStatus = String(envelope?.resolution?.finalStatus || "").trim();
  if (resolutionStatus) return resolutionStatus;
  const decisionFinalStatus = String(envelope?.decision?.finalStatus || "").trim();
  if (decisionFinalStatus) return decisionFinalStatus;
  const decisionStatus = String(envelope?.decision?.status || "").trim();
  if (decisionStatus === "approved") return "approved";
  if (decisionStatus === "blocked") return "blocked";
  return "unknown";
}

function isPreventedStatus(status) {
  return status === "blocked" || status === "tighten_mandate";
}

function isInterventionStatus(status) {
  return status === "blocked" || status === "tighten_mandate" || status === "approved_once";
}

function withinLastWeek(timestamp) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return false;
  return (Date.now() - value.getTime()) <= 7 * 24 * 60 * 60 * 1000;
}

export async function buildSentrySummary(options = {}) {
  const rootDir = resolveRecordRootDir(options);
  const files = await readRecordFiles(rootDir);
  const records = [];

  for (const filePath of files) {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (parsed?.kind === "nornr.sentry.record.v1") {
        records.push(parsed);
      }
    } catch {
      // Keep summary resilient if one local record is malformed.
    }
  }

  let preventedSpendUsd = 0;
  let blockedHighRiskIntents = 0;
  let policyInterventionsThisWeek = 0;
  let latestRecord = null;
  const laneCounts = new Map();
  const statusCounts = {
    approved: 0,
    approved_once: 0,
    blocked: 0,
    shadow_pass: 0,
    tighten_mandate: 0,
    unknown: 0,
  };

  for (const record of records) {
    const status = effectiveStatus(record);
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const actionClass = String(record?.intent?.actionClass || "unknown").trim() || "unknown";
    const currentLane = laneCounts.get(actionClass) || { actionClass, total: 0, blocked: 0, lastAt: "" };
    currentLane.total += 1;
    if (isPreventedStatus(status)) currentLane.blocked += 1;
    currentLane.lastAt = String(record?.generatedAt || currentLane.lastAt || "").trim();
    laneCounts.set(actionClass, currentLane);

    if (!latestRecord || new Date(record?.generatedAt || 0).getTime() > new Date(latestRecord.generatedAt || 0).getTime()) {
      latestRecord = {
        generatedAt: String(record?.generatedAt || "").trim(),
        actionClass,
        status,
        operatorAction: String(record?.resolution?.operatorAction || record?.operator?.resolvedAction || "").trim(),
        primaryReason: String(record?.decision?.primaryReason || "").trim(),
        recordPath: String(record?.resolution?.recordPath || record?.recordPath || "").trim(),
      };
    }

    if (status === "blocked") {
      blockedHighRiskIntents += 1;
    }
    if (isPreventedStatus(status)) {
      preventedSpendUsd += Number(record?.intent?.spendUsd || 0);
    }
    if (withinLastWeek(record?.generatedAt) && isInterventionStatus(status)) {
      policyInterventionsThisWeek += 1;
    }
  }

  return {
    kind: "nornr.sentry.summary.v1",
    generatedAt: new Date().toISOString(),
    projectScope: inferProjectScope(options),
    rootDir,
    defendedRecordsCreated: records.length,
    blockedHighRiskIntents,
    policyInterventionsThisWeek,
    preventedSpendUsd: Number(preventedSpendUsd.toFixed(2)),
    statusCounts,
    latestRecord,
    topLanes: Array.from(laneCounts.values())
      .sort((left, right) => {
        if ((right.total || 0) !== (left.total || 0)) return (right.total || 0) - (left.total || 0);
        return new Date(right.lastAt || 0).getTime() - new Date(left.lastAt || 0).getTime();
      })
      .slice(0, 3),
  };
}

function formatUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function statusLabel(status = "") {
  if (status === "approved_once") return "approved once";
  if (status === "shadow_pass") return "shadow pass";
  if (status === "tighten_mandate") return "tighten mandate";
  return String(status || "unknown").replace(/_/g, " ");
}

export function buildSentrySummaryView(summary, explicitColumns) {
  const { density, compact, wide, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.summary_surface.v1",
    columns,
    density,
    twoColumn: !compact && columns >= 92,
    hero: {
      status: "LOCAL SUMMARY",
      lines: [
        `Defended records created: ${summary.defendedRecordsCreated}`,
        pickByDensity({
          compact: `Prevented spend ${formatUsd(summary.preventedSpendUsd)}`,
          standard: `Prevented spend: ${formatUsd(summary.preventedSpendUsd)}`,
          wide: `Prevented spend: ${formatUsd(summary.preventedSpendUsd)} across the current local record set.`,
        }, density),
      ],
    },
    sections: [
      {
        label: "Current posture",
        lines: [
          `Blocked high-risk intents: ${summary.blockedHighRiskIntents}`,
          `Policy interventions this week: ${summary.policyInterventionsThisWeek}`,
          ...(wide ? [`Currently blocked records: ${summary.statusCounts.blocked || 0}`] : []),
        ],
      },
      ...(!compact ? [{
        label: "Status mix",
        lines: [
          `Approved: ${summary.statusCounts.approved || 0}`,
          `Approved once: ${summary.statusCounts.approved_once || 0}`,
          `Shadow pass: ${summary.statusCounts.shadow_pass || 0}`,
          `Blocked: ${summary.statusCounts.blocked || 0}`,
          ...(wide ? [`Tighten mandate: ${summary.statusCounts.tighten_mandate || 0}`] : []),
        ],
      }] : []),
      ...(summary.latestRecord ? [{
        label: "Latest defended record",
        lines: [
          `${summary.latestRecord.actionClass} · ${statusLabel(summary.latestRecord.status)}`,
          `Operator action: ${summary.latestRecord.operatorAction || "none"}`,
          summary.latestRecord.primaryReason,
        ],
      }] : []),
      ...(summary.topLanes?.length ? [{
        label: "Hot lanes",
        lines: summary.topLanes.map((lane) => `${lane.actionClass}: ${lane.total} records · blocked ${lane.blocked || 0}`),
      }] : []),
    ],
    footer: compact ? [] : [
      `Local records: ${formatDisplayPath(summary.rootDir, summary)}`,
      "This summary reflects real local defended records, not demo attacks.",
    ],
  };
}

export function renderSentrySummary(summary) {
  const view = buildSentrySummaryView(summary);
  return renderSurface({
    hero: renderHero(view.hero),
    sections: view.sections,
    footer: view.footer,
  });
}
