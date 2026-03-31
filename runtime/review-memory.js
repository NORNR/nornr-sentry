import fs from "node:fs/promises";
import path from "node:path";

import { formatDisplayPath, resolveStorageRoot } from "./storage-paths.js";
import { renderHero, renderSurface } from "./terminal-theme.js";

const REVIEW_MEMORY_KIND = "nornr.sentry.review_memory.v1";
const MAX_RECENT_RESOLUTIONS = 12;

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function compact(value = "", maxLength = 160) {
  const normalized = normalizeText(value).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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
  return aliases[normalized] || normalized.replace(/_/g, " ");
}

export function resolveReviewMemoryPath(options = {}, projectScope = null) {
  return path.join(resolveStorageRoot(options, projectScope), ".nornr", "sentry-review-memory.json");
}

export async function readReviewMemory(options = {}, projectScope = null) {
  const filePath = resolveReviewMemoryPath(options, projectScope);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        kind: REVIEW_MEMORY_KIND,
        updatedAt: "",
        lastPending: null,
        lastResolved: null,
        recentResolutions: [],
      };
    }
    throw error;
  }
}

async function writeReviewMemory(filePath = "", value = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildPendingMemory(session = {}, options = {}) {
  return {
    recordedAt: new Date().toISOString(),
    client: normalizeText(options.shield || session?.adapter?.shield || session?.client?.shield || "cursor") || "cursor",
    actionClass: normalizeText(session?.intent?.actionClass),
    title: normalizeText(session?.intent?.title),
    primaryReason: normalizeText(session?.decision?.primaryReason),
    suggestedAction: normalizeText(session?.operator?.suggestedAction),
    trustMode: normalizeText(session?.mandate?.trustMode || options.trustMode),
    protectPreset: normalizeText(session?.mandate?.preset || options.protectPreset),
    recordPath: normalizeText(session?.record?.filePath),
    reviewCommand: `nornr-sentry --client ${normalizeText(options.shield || session?.adapter?.shield || "cursor") || "cursor"} --records`,
  };
}

function buildResolvedMemory(resolution = {}, options = {}) {
  return {
    recordedAt: new Date().toISOString(),
    client: normalizeText(options.shield || resolution?.adapter?.shield || resolution?.client?.shield || "cursor") || "cursor",
    actionClass: normalizeText(resolution?.intent?.actionClass),
    title: normalizeText(resolution?.intent?.title),
    primaryReason: normalizeText(resolution?.decision?.primaryReason),
    operatorAction: normalizeText(resolution?.operatorAction),
    finalStatus: normalizeText(resolution?.decision?.finalStatus || resolution?.decision?.status),
    trustMode: normalizeText(resolution?.mandate?.trustMode || options.trustMode),
    protectPreset: normalizeText(resolution?.mandate?.preset || options.protectPreset),
    recordPath: normalizeText(resolution?.record?.filePath),
    resumeCommand: `nornr-sentry --client ${normalizeText(options.shield || resolution?.adapter?.shield || "cursor") || "cursor"} --resume`,
  };
}

export async function rememberPendingReview(session = {}, options = {}) {
  const existing = await readReviewMemory(options, session?.projectScope || null);
  const filePath = resolveReviewMemoryPath(options, session?.projectScope || null);
  const next = {
    ...existing,
    kind: REVIEW_MEMORY_KIND,
    updatedAt: new Date().toISOString(),
    lastPending: buildPendingMemory(session, options),
  };
  await writeReviewMemory(filePath, next);
  return next;
}

export async function rememberResolvedReview(resolution = {}, options = {}) {
  const existing = await readReviewMemory(options, resolution?.projectScope || null);
  const filePath = resolveReviewMemoryPath(options, resolution?.projectScope || null);
  const lastResolved = buildResolvedMemory(resolution, options);
  const recentResolutions = [
    lastResolved,
    ...((Array.isArray(existing?.recentResolutions) ? existing.recentResolutions : []).filter((entry) => {
      const recordedAt = normalizeText(entry?.recordedAt);
      const recordPath = normalizeText(entry?.recordPath);
      return recordedAt !== lastResolved.recordedAt && recordPath !== lastResolved.recordPath;
    })),
  ].slice(0, MAX_RECENT_RESOLUTIONS);
  const next = {
    ...existing,
    kind: REVIEW_MEMORY_KIND,
    updatedAt: new Date().toISOString(),
    lastPending: existing?.lastPending || null,
    lastResolved,
    recentResolutions,
  };
  await writeReviewMemory(filePath, next);
  return next;
}

export function buildResumeReview(memory = {}, options = {}) {
  const lastPending = memory?.lastPending || null;
  const lastResolved = memory?.lastResolved || null;
  const recent = Array.isArray(memory?.recentResolutions) ? memory.recentResolutions.slice(0, 5) : [];
  const client = normalizeText(options.shield || lastPending?.client || lastResolved?.client || "cursor") || "cursor";
  const headline = lastPending
    ? `Resume the latest ${actionClassLabel(lastPending.actionClass).toLowerCase()} review.`
    : lastResolved
      ? `Resume from the latest ${actionClassLabel(lastResolved.actionClass).toLowerCase()} decision.`
      : "No saved review memory exists yet.";
  const sections = [];
  if (lastPending) {
    sections.push({
      label: "Pending review",
      lines: [
        `${actionClassLabel(lastPending.actionClass)} · ${lastPending.suggestedAction || "Review pending"}`,
        compact(lastPending.primaryReason || "No primary reason recorded."),
        `Record: ${formatDisplayPath(lastPending.recordPath, options) || "not written yet"}`,
        `Resume path: ${lastPending.reviewCommand || `nornr-sentry --client ${client} --records`}`,
      ],
    });
  }
  if (lastResolved) {
    sections.push({
      label: "Latest decision",
      lines: [
        `${actionClassLabel(lastResolved.actionClass)} · ${lastResolved.operatorAction || "No operator action"} · ${lastResolved.finalStatus || "unknown"}`,
        compact(lastResolved.primaryReason || "No primary reason recorded."),
        `Record: ${formatDisplayPath(lastResolved.recordPath, options) || "none"}`,
        `Resume path: ${lastResolved.resumeCommand || `nornr-sentry --client ${client} --resume`}`,
      ],
    });
  }
  if (recent.length) {
    sections.push({
      label: "Recent decisions",
      lines: recent.map((entry) => `${actionClassLabel(entry.actionClass)} · ${entry.operatorAction || "none"} · ${entry.finalStatus || "unknown"}`),
    });
  }
  if (!sections.length) {
    sections.push({
      label: "Start here",
      lines: [
        `Run nornr-sentry --client ${client} --first-stop to create the first saved review context.`,
        "Saved review memory appears once a real stop or review decision exists.",
      ],
    });
  }

  const nextEntries = [];
  if (lastPending?.reviewCommand) {
    nextEntries.push(lastPending.reviewCommand);
  }
  if (lastResolved?.recordPath) {
    nextEntries.push(`nornr-sentry --client ${client} --export-record ${lastResolved.recordPath}`);
  }
  if (!nextEntries.length) {
    nextEntries.push(`nornr-sentry --client ${client} --first-stop`);
  }

  return {
    kind: "nornr.sentry.resume_review.v1",
    headline,
    client,
    sections,
    nextEntries,
  };
}

export function renderResumeReview(view = {}) {
  return renderSurface({
    hero: renderHero({
      status: "RESUME REVIEW",
      lines: [
        `Client ${view.client || "cursor"} · Saved review memory`,
        view.headline || "Resume the latest NORNR Sentry review context.",
      ],
    }),
    sections: [
      ...(view.sections || []),
      {
        label: "Next commands",
        lines: (view.nextEntries || []).map((line) => `  ${line}`),
      },
    ],
    footer: ["Review memory is local to this workspace unless you point Sentry at another project root."],
  });
}
