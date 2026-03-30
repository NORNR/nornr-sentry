import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { readDefendedRecord, listDefendedRecordFiles } from "../artifacts/write-record.js";
import { evaluateIntent } from "../decisions/evaluate.js";
import { buildDefaultMandate } from "../mandates/defaults.js";
import { renderHero, renderSurface } from "./terminal-theme.js";

const PROJECT_MARKERS = [".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod"];
const READ_SCOPE_CANDIDATES = ["src", "docs", "apps", "packages", "integrations", "tests"];
const WRITE_SCOPE_CANDIDATES = ["src", "dist", "apps", "packages", "integrations", "tests"];
const BASELINE_KIND = "nornr.sentry.baseline.v1";
const BASELINE_HISTORY_KIND = "nornr.sentry.baseline_history.v1";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeMandate(base = {}, patch = {}) {
  if (!isObject(base)) return patch;
  if (!isObject(patch)) return patch;
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isObject(value) && isObject(next[key])) {
      next[key] = mergeMandate(next[key], value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function fileExists(candidate = "") {
  try {
    fs.accessSync(candidate);
    return true;
  } catch {
    return false;
  }
}

function detectMarker(dirPath = "") {
  for (const marker of PROJECT_MARKERS) {
    if (fileExists(path.join(dirPath, marker))) {
      return marker;
    }
  }
  return "";
}

function collectExistingScopePaths(rootDir = "", names = []) {
  const hits = (Array.isArray(names) ? names : [])
    .map((name) => path.join(rootDir, name))
    .filter((candidate) => fileExists(candidate));
  if (!hits.length && rootDir) {
    return [rootDir];
  }
  return hits;
}

function formatDiffValue(value) {
  return JSON.stringify(value);
}

function appendDiffLines(lines, beforeValue, afterValue, keyPath) {
  const label = keyPath.join(".");
  if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
    if (JSON.stringify(beforeValue ?? null) !== JSON.stringify(afterValue ?? null)) {
      lines.push(`~ ${label}: ${formatDiffValue(beforeValue ?? [])} -> ${formatDiffValue(afterValue ?? [])}`);
    }
    return;
  }
  if (isObject(beforeValue) || isObject(afterValue)) {
    const keys = Array.from(new Set([
      ...Object.keys(isObject(beforeValue) ? beforeValue : {}),
      ...Object.keys(isObject(afterValue) ? afterValue : {}),
    ])).sort();
    for (const key of keys) {
      appendDiffLines(
        lines,
        isObject(beforeValue) ? beforeValue[key] : undefined,
        isObject(afterValue) ? afterValue[key] : undefined,
        [...keyPath, key],
      );
    }
    return;
  }
  if (beforeValue === undefined && afterValue !== undefined) {
    lines.push(`+ ${label}: ${formatDiffValue(afterValue)}`);
    return;
  }
  if (beforeValue !== undefined && afterValue === undefined) {
    lines.push(`- ${label}: ${formatDiffValue(beforeValue)}`);
    return;
  }
  if (beforeValue !== afterValue) {
    lines.push(`~ ${label}: ${formatDiffValue(beforeValue)} -> ${formatDiffValue(afterValue)}`);
  }
}

export function detectProjectScope(startDir = process.cwd()) {
  let currentDir = path.resolve(startDir || process.cwd());
  while (true) {
    const marker = detectMarker(currentDir);
    if (marker) {
      return {
        rootDir: currentDir,
        projectName: path.basename(currentDir),
        detectedFrom: marker,
        suggestedReadPaths: collectExistingScopePaths(currentDir, READ_SCOPE_CANDIDATES),
        suggestedWritePaths: collectExistingScopePaths(currentDir, WRITE_SCOPE_CANDIDATES),
      };
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

export function resolveMandatePath(options = {}, projectScope = null) {
  const explicit = String(options.mandatePath || "").trim();
  if (explicit) return path.resolve(explicit);
  if (projectScope?.rootDir) {
    return path.join(projectScope.rootDir, ".nornr", "sentry-mandate.json");
  }
  return path.join(os.homedir(), ".nornr", "sentry-mandate.json");
}

export function resolveMandateHistoryPath(options = {}, projectScope = null) {
  const mandatePath = resolveMandatePath(options, projectScope);
  return path.join(path.dirname(mandatePath), "sentry-mandate-history.jsonl");
}

export function resolveBaselinePath(options = {}, projectScope = null) {
  const explicit = String(options.baselinePath || "").trim();
  if (explicit) return path.resolve(explicit);
  if (projectScope?.rootDir) {
    return path.join(projectScope.rootDir, ".nornr", "sentry-baseline.json");
  }
  return path.join(os.homedir(), ".nornr", "sentry-baseline.json");
}

export function resolveBaselineHistoryPath(options = {}, projectScope = null) {
  const baselinePath = resolveBaselinePath(options, projectScope);
  return path.join(path.dirname(baselinePath), "sentry-baseline-history.jsonl");
}

export function resolveMandatePackPath(options = {}, projectScope = null) {
  if (projectScope?.rootDir) {
    return path.join(projectScope.rootDir, ".nornr", "sentry-mandate-pack.json");
  }
  return path.join(os.homedir(), ".nornr", "sentry-mandate-pack.json");
}

async function readStoredMandate(mandatePath = "") {
  if (!mandatePath || !fileExists(mandatePath)) return null;
  const raw = await fsp.readFile(mandatePath, "utf8");
  return JSON.parse(raw);
}

function latestIsoTimestamp(...values) {
  return values
    .map((value) => String(value || "").trim())
    .find(Boolean) || new Date().toISOString();
}

function baselineVersionNumber(version = "") {
  const match = /(\d+)$/.exec(String(version || "").trim());
  return match ? Number(match[1]) : 0;
}

function nextBaselineVersion(entries = []) {
  const maxVersion = (Array.isArray(entries) ? entries : [])
    .reduce((max, entry) => Math.max(max, baselineVersionNumber(entry?.version || entry?.baselineEnvelope?.metadata?.version || "")), 0);
  return `baseline_v${maxVersion + 1}`;
}

function normalizeReviewState(value = "") {
  const normalized = String(value || "").trim();
  if (["pending", "approve-baseline", "hold", "tighten-further"].includes(normalized)) {
    return normalized;
  }
  return "pending";
}

function normalizeBaselineMetadata(metadata = {}, options = {}) {
  return {
    version: String(metadata?.version || options.version || "baseline_v1").trim() || "baseline_v1",
    owner: String(metadata?.owner || options.baselineOwner || options.ownerId || "owner_local_operator").trim() || "owner_local_operator",
    reason: String(metadata?.reason || options.baselineReason || "Shared mandate baseline.").trim() || "Shared mandate baseline.",
    createdAt: latestIsoTimestamp(metadata?.createdAt, options.createdAt),
    reviewState: normalizeReviewState(metadata?.reviewState || options.reviewState || ""),
    sourcePackPath: String(metadata?.sourcePackPath || options.sourcePackPath || "").trim(),
    originVersion: String(metadata?.originVersion || options.originVersion || "").trim(),
  };
}

function normalizeBaselineEnvelope(raw = null, options = {}) {
  if (!isObject(raw)) return null;
  if (String(raw.kind || "").trim() === BASELINE_KIND && isObject(raw.baseline)) {
    return {
      kind: BASELINE_KIND,
      metadata: normalizeBaselineMetadata(raw.metadata || {}, options),
      baseline: raw.baseline,
    };
  }
  return {
    kind: BASELINE_KIND,
    metadata: normalizeBaselineMetadata({}, options),
    baseline: raw,
  };
}

function effectiveReplayStatus(decision = {}) {
  return String(decision?.status || "").trim() || "unknown";
}

function compareReplayOutcome(currentStatus = "", candidateStatus = "") {
  const currentBlocked = String(currentStatus || "").trim() === "blocked";
  const candidateBlocked = String(candidateStatus || "").trim() === "blocked";
  if (currentBlocked && candidateBlocked) return "still_blocked";
  if (!currentBlocked && candidateBlocked) return "newly_blocked";
  if (currentBlocked && !candidateBlocked) return "now_clears";
  return "same_clear";
}

function dedupeStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function intersectStrings(baseValues = [], localValues = []) {
  const base = dedupeStrings(baseValues);
  const local = dedupeStrings(localValues);
  if (!local.length) return base;
  return local.filter((item) => base.includes(item));
}

function narrowPathScope(baseValues = [], localValues = []) {
  const base = dedupeStrings(baseValues).map((value) => path.resolve(value));
  const local = dedupeStrings(localValues).map((value) => path.resolve(value));
  if (!base.length) return local;
  if (!local.length) return base;
  const narrowed = local.filter((candidate) => base.some((allowed) => candidate === allowed || candidate.startsWith(`${allowed}${path.sep}`)));
  return narrowed.length ? narrowed : base;
}

function tightenNumericLimit(baseValue, localValue) {
  const base = Number(baseValue);
  const local = Number(localValue);
  if (!Number.isFinite(base) && !Number.isFinite(local)) return undefined;
  if (!Number.isFinite(base)) return local;
  if (!Number.isFinite(local)) return base;
  return Math.min(base, local);
}

export function mergeTighteningMandate(base = {}, local = {}) {
  const next = mergeMandate(base, local);
  next.paths = {
    ...(isObject(base?.paths) ? base.paths : {}),
    ...(isObject(local?.paths) ? local.paths : {}),
    read: narrowPathScope(base?.paths?.read || [], local?.paths?.read || []),
    write: narrowPathScope(base?.paths?.write || [], local?.paths?.write || []),
    blockedWrite: dedupeStrings([...(base?.paths?.blockedWrite || []), ...(local?.paths?.blockedWrite || [])]),
  };
  next.tools = {
    ...(isObject(base?.tools) ? base.tools : {}),
    ...(isObject(local?.tools) ? local.tools : {}),
    allowed: intersectStrings(base?.tools?.allowed || [], local?.tools?.allowed || []),
    blocked: dedupeStrings([...(base?.tools?.blocked || []), ...(local?.tools?.blocked || [])]),
  };
  next.limits = {
    ...(isObject(base?.limits) ? base.limits : {}),
    ...(isObject(local?.limits) ? local.limits : {}),
    spendUsdAbove: tightenNumericLimit(base?.limits?.spendUsdAbove, local?.limits?.spendUsdAbove),
    outboundRequiresApproval: Boolean(base?.limits?.outboundRequiresApproval || local?.limits?.outboundRequiresApproval),
    destructiveActionsBlocked: Boolean(base?.limits?.destructiveActionsBlocked || local?.limits?.destructiveActionsBlocked),
    blockedActionClasses: dedupeStrings([...(base?.limits?.blockedActionClasses || []), ...(local?.limits?.blockedActionClasses || [])]),
    approvalActionClasses: dedupeStrings([...(base?.limits?.approvalActionClasses || []), ...(local?.limits?.approvalActionClasses || [])]),
  };
  if (isObject(base?.projectScope) || isObject(local?.projectScope)) {
    next.projectScope = {
      ...(isObject(base?.projectScope) ? base.projectScope : {}),
      ...(isObject(local?.projectScope) ? local.projectScope : {}),
    };
  }
  return next;
}

async function readStoredBaselineEnvelope(baselinePath = "", options = {}) {
  const raw = await readStoredMandate(baselinePath);
  return normalizeBaselineEnvelope(raw, options);
}

function buildEffectiveMandateFromState(shield = "cursor", options = {}) {
  const projectScope = options.projectScope || null;
  const baseMandate = buildDefaultMandate(shield, {
    ...options,
    projectScope,
  });
  const baselineEnvelope = normalizeBaselineEnvelope(options.baselineEnvelope || null, {
    ...options,
    projectScope,
  });
  const baselineMandate = baselineEnvelope ? mergeTighteningMandate(baseMandate, baselineEnvelope.baseline) : baseMandate;
  return options.storedMandate ? mergeTighteningMandate(baselineMandate, options.storedMandate) : baselineMandate;
}

async function appendBaselineHistoryEntry(entry = {}, options = {}) {
  const historyPath = resolveBaselineHistoryPath(options, options.projectScope || null);
  const baselineEnvelope = normalizeBaselineEnvelope(entry.baselineEnvelope || null, {
    ...options,
    sourcePackPath: entry.sourcePackPath || "",
  });
  const envelope = {
    kind: BASELINE_HISTORY_KIND,
    recordedAt: latestIsoTimestamp(entry.recordedAt),
    action: String(entry.action || "").trim() || "baseline_update",
    summary: String(entry.summary || "").trim() || "Updated the shared baseline.",
    baselinePath: String(entry.baselinePath || resolveBaselinePath(options, options.projectScope || null)).trim(),
    version: String(baselineEnvelope?.metadata?.version || entry.version || "").trim(),
    sourcePackPath: String(entry.sourcePackPath || baselineEnvelope?.metadata?.sourcePackPath || "").trim(),
    reviewState: normalizeReviewState(entry.reviewState || baselineEnvelope?.metadata?.reviewState || ""),
    projectScope: entry.projectScope && isObject(entry.projectScope) ? entry.projectScope : null,
    baselineEnvelope,
  };
  await fsp.mkdir(path.dirname(historyPath), { recursive: true });
  await fsp.appendFile(historyPath, `${JSON.stringify(envelope)}\n`, "utf8");
  return {
    historyPath,
    entry: envelope,
  };
}

export async function readBaselineHistoryEntries(options = {}) {
  const derivedProjectScope = options.projectScope || detectProjectScope(options.projectRoot || options.cwd || process.cwd());
  const historyPath = resolveBaselineHistoryPath(options, derivedProjectScope || null);
  try {
    const raw = await fsp.readFile(historyPath, "utf8");
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => String(right?.recordedAt || "").localeCompare(String(left?.recordedAt || "")));
    return {
      historyPath,
      entries,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        historyPath,
        entries: [],
      };
    }
    throw error;
  }
}

async function buildBaselineReplayComparison(currentMandate = {}, candidateMandate = {}, options = {}) {
  const rootDir = options.recordRootDir || path.resolve(process.cwd(), "data", "records");
  const files = await listDefendedRecordFiles(rootDir);
  const records = await Promise.all(files.slice(-12).map((filePath) => readDefendedRecord(filePath)));
  const rows = records.map((record) => {
    const currentDecision = evaluateIntent(record?.intent || {}, currentMandate);
    const candidateDecision = evaluateIntent(record?.intent || {}, candidateMandate);
    const currentStatus = effectiveReplayStatus(currentDecision);
    const candidateStatus = effectiveReplayStatus(candidateDecision);
    return {
      recordPath: String(record?.recordPath || record?.filePath || "").trim(),
      recordedAt: String(record?.generatedAt || "").trim(),
      actionClass: String(record?.intent?.actionClass || "").trim(),
      currentStatus,
      candidateStatus,
      outcome: compareReplayOutcome(currentStatus, candidateStatus),
      currentReason: String(currentDecision?.primaryReason || "").trim(),
      candidateReason: String(candidateDecision?.primaryReason || "").trim(),
    };
  });
  return {
    rows,
    counts: {
      newlyBlocked: rows.filter((row) => row.outcome === "newly_blocked").length,
      stillBlocked: rows.filter((row) => row.outcome === "still_blocked").length,
      nowClears: rows.filter((row) => row.outcome === "now_clears").length,
      sameClear: rows.filter((row) => row.outcome === "same_clear").length,
    },
  };
}

async function appendMandateHistoryEntry(entry = {}, options = {}) {
  const historyPath = resolveMandateHistoryPath(options, options.projectScope || null);
  const envelope = {
    kind: "nornr.sentry.mandate_history.v1",
    recordedAt: new Date().toISOString(),
    action: String(entry.action || "").trim() || "mandate_update",
    summary: String(entry.summary || "").trim(),
    mandatePath: String(entry.mandatePath || resolveMandatePath(options, options.projectScope || null)).trim(),
    sourceRecordPath: String(entry.sourceRecordPath || "").trim(),
    diffLines: Array.isArray(entry.diffLines) ? entry.diffLines : [],
    projectScope: entry.projectScope && isObject(entry.projectScope) ? entry.projectScope : null,
  };
  await fsp.mkdir(path.dirname(historyPath), { recursive: true });
  await fsp.appendFile(historyPath, `${JSON.stringify(envelope)}\n`, "utf8");
  return {
    historyPath,
    entry: envelope,
  };
}

export async function readMandateHistoryEntries(options = {}) {
  const derivedProjectScope = options.projectScope || detectProjectScope(options.projectRoot || options.cwd || process.cwd());
  const historyPath = resolveMandateHistoryPath(options, derivedProjectScope || null);
  try {
    const raw = await fsp.readFile(historyPath, "utf8");
    const entries = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => String(right?.recordedAt || "").localeCompare(String(left?.recordedAt || "")));
    return {
      historyPath,
      entries,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        historyPath,
        entries: [],
      };
    }
    throw error;
  }
}

export function mandateNeedsProjectScope(mandate = {}, projectScope = null) {
  if (!projectScope?.rootDir) return false;
  return String(mandate?.projectScope?.rootDir || "").trim() !== projectScope.rootDir;
}

export function buildProjectScopedMandatePatch(mandate = {}, projectScope = null) {
  if (!projectScope?.rootDir) return null;
  return {
    projectScope: {
      projectName: projectScope.projectName,
      rootDir: projectScope.rootDir,
      detectedFrom: projectScope.detectedFrom,
    },
    paths: {
      read: projectScope.suggestedReadPaths,
      write: projectScope.suggestedWritePaths,
      blockedWrite: Array.from(new Set([
        ...(Array.isArray(mandate?.paths?.blockedWrite) ? mandate.paths.blockedWrite : []),
        "~",
        "/etc",
        "/private",
        "/var",
        "/System",
      ].map((value) => String(value || "").trim()).filter(Boolean))),
    },
  };
}

export function buildMandateDiffLines(before = {}, after = {}) {
  const lines = [];
  appendDiffLines(lines, before, after, []);
  return lines.filter(Boolean);
}

export function buildMandateSuggestionArtifacts(mandate = {}, patch = {}, options = {}) {
  const nextMandate = mergeMandate(mandate, patch);
  return {
    nextMandate,
    diffLines: buildMandateDiffLines(mandate, nextMandate),
    mandatePath: resolveMandatePath(options, options.projectScope || null),
  };
}

function buildMandatePreviewLines(mandate = {}) {
  return [
    `Owner: ${String(mandate?.ownerId || "").trim() || "local_operator"}`,
    `Read scope: ${(mandate?.paths?.read || []).join(", ") || "(none)"}`,
    `Write scope: ${(mandate?.paths?.write || []).join(", ") || "(none)"}`,
    `Blocked tools: ${(mandate?.tools?.blocked || []).join(", ") || "(none)"}`,
    `Blocked classes: ${(mandate?.limits?.blockedActionClasses || []).join(", ") || "(none)"}`,
    `Approval classes: ${(mandate?.limits?.approvalActionClasses || []).join(", ") || "(none)"}`,
  ];
}

export function inspectMandateInitPlan(shield = "cursor", options = {}) {
  const explicitProjectRoot = String(options.projectRoot || "").trim();
  let projectScope = detectProjectScope(explicitProjectRoot || options.cwd || process.cwd());
  if (!projectScope && explicitProjectRoot && fileExists(explicitProjectRoot)) {
    const rootDir = path.resolve(explicitProjectRoot);
    projectScope = {
      rootDir,
      projectName: path.basename(rootDir),
      detectedFrom: "explicit_project_root",
      suggestedReadPaths: collectExistingScopePaths(rootDir, READ_SCOPE_CANDIDATES),
      suggestedWritePaths: collectExistingScopePaths(rootDir, WRITE_SCOPE_CANDIDATES),
    };
  }
  const mandatePath = resolveMandatePath(options, projectScope);
  const historyPath = resolveMandateHistoryPath(
    {
      ...options,
      mandatePath,
    },
    projectScope,
  );
  const exists = fileExists(mandatePath);
  const nextMandate = exists
    ? JSON.parse(fs.readFileSync(mandatePath, "utf8"))
    : buildDefaultMandate(shield, {
        ...options,
        projectScope,
      });
  return {
    kind: "nornr.sentry.mandate_init.v1",
    shield,
    mandatePath,
    historyPath,
    projectScope,
    exists,
    nextMandate,
    previewLines: buildMandatePreviewLines(nextMandate),
    diffLines: exists ? [] : buildMandateDiffLines({}, nextMandate),
  };
}

export async function buildMandateInitPlan(shield = "cursor", options = {}) {
  return inspectMandateInitPlan(shield, options);
}

export function renderMandateInitPlan(plan = {}) {
  const contextLines = [
    `Target: ${plan.mandatePath}`,
    `Mode: ${plan.exists ? "existing local mandate found" : "create new project-scoped mandate"}`,
  ];
  if (plan.projectScope?.projectName) {
    contextLines.push(`Project: ${plan.projectScope.projectName}`);
  }
  if (plan.projectScope?.detectedFrom) {
    contextLines.push(`Detected from: ${plan.projectScope.detectedFrom}`);
  }
  return renderSurface({
    hero: renderHero({
      status: "MANDATE INIT",
      lines: [
        `Target ${plan.mandatePath}`,
        plan.exists ? "Existing local mandate found." : "Project-scoped local mandate ready to write.",
      ],
    }),
    sections: [
      {
        label: "Context",
        lines: contextLines,
      },
      {
        label: "Safe defaults",
        lines: (plan.previewLines || []).map((line) => `- ${line}`),
      },
      ...(Array.isArray(plan.diffLines) && plan.diffLines.length ? [{
        label: "Preview",
        lines: plan.diffLines.slice(0, 12),
      }] : []),
    ],
    footer: [
      plan.exists
        ? "Next step: reuse the existing mandate or tighten it from a defended stop."
        : "Next step: rerun with --apply to write this mandate locally.",
    ],
  });
}

export async function buildActiveMandate(shield = "cursor", options = {}) {
  const explicitProjectRoot = String(options.projectRoot || "").trim();
  let projectScope = detectProjectScope(explicitProjectRoot || options.cwd || process.cwd());
  if (!projectScope && explicitProjectRoot && fileExists(explicitProjectRoot)) {
    const rootDir = path.resolve(explicitProjectRoot);
    projectScope = {
      rootDir,
      projectName: path.basename(rootDir),
      detectedFrom: "explicit_project_root",
      suggestedReadPaths: collectExistingScopePaths(rootDir, READ_SCOPE_CANDIDATES),
      suggestedWritePaths: collectExistingScopePaths(rootDir, WRITE_SCOPE_CANDIDATES),
    };
  }
  const mandatePath = resolveMandatePath(options, projectScope);
  const baselinePath = resolveBaselinePath(options, projectScope);
  const storedMandate = await readStoredMandate(mandatePath);
  const storedBaselineEnvelope = await readStoredBaselineEnvelope(baselinePath, options);
  const mandate = buildEffectiveMandateFromState(shield, {
    ...options,
    projectScope,
    baselineEnvelope: storedBaselineEnvelope,
    storedMandate,
  });
  const baselineHistoryPath = resolveBaselineHistoryPath(options, projectScope);
  mandate.context = {
    cwd: path.resolve(options.cwd || process.cwd()),
    projectRoot: projectScope?.rootDir || "",
  };
  mandate.storage = {
    mandatePath,
    baselinePath,
    baselineVersion: storedBaselineEnvelope?.metadata?.version || "",
    source: storedMandate ? "local_file" : storedBaselineEnvelope ? "baseline_file" : "default",
  };
  return {
    mandate,
    mandatePath,
    baselinePath,
    baselineHistoryPath,
    projectScope,
    storedMandate,
    storedBaseline: storedBaselineEnvelope?.baseline || null,
    storedBaselineEnvelope,
    baselineMetadata: storedBaselineEnvelope?.metadata || null,
  };
}

export async function applyMandateInitPlan(plan = {}, options = {}) {
  const mandatePath = String(plan?.mandatePath || "").trim()
    || resolveMandatePath(options, plan?.projectScope || null);
  const nextMandate = isObject(plan?.nextMandate) ? plan.nextMandate : null;
  if (!nextMandate) {
    throw new Error("Mandate init plan is missing the next mandate snapshot.");
  }
  const existed = fileExists(mandatePath);
  if (existed) {
    const history = await appendMandateHistoryEntry({
      action: "mandate_init_reused",
      summary: `Reused the existing local mandate for "${plan?.projectScope?.projectName || "this project"}".`,
      mandatePath,
      diffLines: [],
      projectScope: plan?.projectScope || null,
    }, {
      ...options,
      mandatePath,
      projectScope: plan?.projectScope || null,
    });
    return {
      applied: false,
      created: false,
      reused: true,
      mandatePath,
      diffLines: [],
      historyPath: history.historyPath,
      historyEntry: history.entry,
    };
  }
  await fsp.mkdir(path.dirname(mandatePath), { recursive: true });
  await fsp.writeFile(mandatePath, `${JSON.stringify(nextMandate, null, 2)}\n`, "utf8");
  const history = await appendMandateHistoryEntry({
    action: "mandate_init",
    summary: `Initialized a project-scoped local mandate for "${plan?.projectScope?.projectName || "this project"}".`,
    mandatePath,
    diffLines: Array.isArray(plan?.diffLines) ? plan.diffLines : buildMandateDiffLines({}, nextMandate),
    projectScope: plan?.projectScope || null,
  }, {
    ...options,
    mandatePath,
    projectScope: plan?.projectScope || null,
  });
  return {
    applied: true,
    created: true,
    reused: false,
    mandatePath,
    diffLines: Array.isArray(plan?.diffLines) ? plan.diffLines : buildMandateDiffLines({}, nextMandate),
    historyPath: history.historyPath,
    historyEntry: history.entry,
  };
}

export function renderMandateApplySummary(result = {}) {
  return renderSurface({
    hero: renderHero({
      status: "MANDATE APPLIED",
      lines: [
        `Target ${result.mandatePath}`,
        result.reused ? "Existing mandate kept in place." : "Project-scoped local mandate written.",
      ],
    }),
    sections: [
      {
        label: "Artifacts",
        lines: [
          `Target: ${result.mandatePath}`,
          ...(result.historyPath ? [`History: ${result.historyPath}`] : []),
        ],
      },
    ],
    footer: [
      "Next step: run --repo-snapshot or start the local shield with --serve.",
    ],
  });
}

export function renderTightenHistory(history = {}) {
  return renderSurface({
    hero: renderHero({
      status: "TIGHTEN HISTORY",
      lines: [
        `Target ${history.historyPath}`,
        `Entries ${Array.isArray(history.entries) ? history.entries.length : 0}`,
      ],
    }),
    sections: [
      {
        label: "Recent entries",
        lines: history.entries?.length
          ? (history.entries || []).slice(0, 8).map((entry) => `- ${entry.recordedAt} | ${entry.action} | ${entry.summary || "Local mandate update"}`)
          : ["No tighten history recorded yet."],
      },
    ],
  });
}

export async function exportMandatePack(shield = "cursor", options = {}) {
  const {
    mandate,
    mandatePath,
    baselinePath,
    projectScope,
    storedBaseline,
    baselineMetadata,
  } = await buildActiveMandate(shield, options);
  const history = await readMandateHistoryEntries({
    ...options,
    mandatePath,
    projectScope,
  });
  const packPath = resolveMandatePackPath(options, projectScope);
  const pack = {
    kind: "nornr.sentry.mandate_pack.v1",
    exportedAt: new Date().toISOString(),
    shield,
    projectScope,
    baselinePath,
    mandatePath,
    baselineMetadata: normalizeBaselineMetadata(baselineMetadata || {}, {
      ...options,
      version: baselineMetadata?.version || "baseline_v1",
      reviewState: baselineMetadata?.reviewState || "pending",
    }),
    baseline: storedBaseline || mandate,
    preview: {
      blockedTools: mandate?.tools?.blocked || [],
      blockedActionClasses: mandate?.limits?.blockedActionClasses || [],
      approvalActionClasses: mandate?.limits?.approvalActionClasses || [],
    },
    tightenHistory: (history.entries || []).slice(0, 8),
  };
  await fsp.mkdir(path.dirname(packPath), { recursive: true });
  await fsp.writeFile(packPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  return {
    packPath,
    pack,
  };
}

export function renderMandatePackExport(result = {}) {
  return renderSurface({
    hero: renderHero({
      status: "MANDATE PACK EXPORT",
      lines: [
        `Pack ${result.packPath}`,
        `Version ${result.pack?.baselineMetadata?.version || "baseline_v1"}`,
      ],
    }),
    sections: [
      {
        label: "Preview",
        lines: [
          `Blocked tools: ${(result.pack?.preview?.blockedTools || []).join(", ") || "(none)"}`,
          `Blocked classes: ${(result.pack?.preview?.blockedActionClasses || []).join(", ") || "(none)"}`,
        ],
      },
    ],
  });
}

export async function previewMandatePackImport(packPath = "", options = {}) {
  const resolvedPath = path.resolve(String(packPath || "").trim());
  const pack = JSON.parse(await fsp.readFile(resolvedPath, "utf8"));
  if (String(pack?.kind || "").trim() !== "nornr.sentry.mandate_pack.v1") {
    throw new Error("Mandate pack is not a NORNR Sentry mandate pack.");
  }
  const current = await buildActiveMandate(options.shield || "cursor", options);
  const projectScope = detectProjectScope(options.projectRoot || options.cwd || process.cwd())
    || (pack?.projectScope && isObject(pack.projectScope) ? pack.projectScope : null);
  const baselineHistory = await readBaselineHistoryEntries({
    ...options,
    projectScope: projectScope || null,
  });
  const nextVersion = nextBaselineVersion(baselineHistory.entries);
  const importedVersion = String(options.forceBaselineVersion || "").trim()
    || (options.keepBaselineVersion ? String(pack?.baselineMetadata?.version || "").trim() : "")
    || nextVersion;
  const candidateEnvelope = normalizeBaselineEnvelope({
    kind: BASELINE_KIND,
    metadata: {
      version: importedVersion,
      owner: options.baselineOwner || pack?.baselineMetadata?.owner || options.ownerId || "owner_local_operator",
      reason: options.baselineReason || pack?.baselineMetadata?.reason || `Imported shared mandate baseline from "${path.basename(resolvedPath)}".`,
      createdAt: new Date().toISOString(),
      reviewState: "pending",
      sourcePackPath: resolvedPath,
      originVersion: pack?.baselineMetadata?.version || "",
    },
    baseline: pack?.baseline || {},
  }, options);
  const baselinePath = resolveBaselinePath(
    {
      ...options,
      baselinePath: options.baselinePath || "",
    },
    projectScope || null,
  );
  const candidateMandate = buildEffectiveMandateFromState(options.shield || "cursor", {
    ...options,
    projectScope: projectScope || null,
    baselineEnvelope: candidateEnvelope,
    storedMandate: current.storedMandate,
  });
  const replay = await buildBaselineReplayComparison(current.mandate, candidateMandate, options);
  return {
    applied: false,
    packPath: resolvedPath,
    baselinePath,
    projectScope: projectScope || null,
    pack,
    candidateEnvelope,
    currentBaselineVersion: current.baselineMetadata?.version || "",
    currentBaseline: current.storedBaseline || {},
    diffLines: buildMandateDiffLines(current.storedBaseline || {}, candidateEnvelope.baseline),
    replay,
  };
}

async function applyImportedMandatePack(preview = {}, options = {}) {
  await fsp.mkdir(path.dirname(preview.baselinePath), { recursive: true });
  await fsp.writeFile(preview.baselinePath, `${JSON.stringify(preview.candidateEnvelope, null, 2)}\n`, "utf8");
  const baselineHistory = await appendBaselineHistoryEntry({
    action: "baseline_import",
    summary: `Imported a shared mandate baseline from "${path.basename(preview.packPath)}".`,
    baselinePath: preview.baselinePath,
    sourcePackPath: preview.packPath,
    reviewState: preview.candidateEnvelope?.metadata?.reviewState || "pending",
    projectScope: preview.projectScope || null,
    baselineEnvelope: preview.candidateEnvelope,
  }, {
    ...options,
    baselinePath: preview.baselinePath,
    projectScope: preview.projectScope || null,
  });
  const mandateHistory = await appendMandateHistoryEntry({
    action: "baseline_import",
    summary: `Imported baseline version "${preview.candidateEnvelope?.metadata?.version || ""}" from "${path.basename(preview.packPath)}".`,
    mandatePath: resolveMandatePath(options, preview.projectScope || null),
    sourceRecordPath: preview.packPath,
    diffLines: preview.diffLines || [],
    projectScope: preview.projectScope || null,
  }, {
    ...options,
    baselinePath: preview.baselinePath,
    projectScope: preview.projectScope || null,
  });
  return {
    ...preview,
    applied: true,
    historyPath: mandateHistory.historyPath,
    baselineHistoryPath: baselineHistory.historyPath,
  };
}

export async function importMandatePack(packPath = "", options = {}) {
  const preview = await previewMandatePackImport(packPath, options);
  if (!options.apply) return preview;
  return applyImportedMandatePack(preview, options);
}

export function renderMandatePackImport(result = {}) {
  return renderSurface({
    hero: renderHero({
      status: result.applied ? "MANDATE PACK IMPORT" : "MANDATE PACK PREVIEW",
      lines: [
        `Pack ${result.packPath}`,
        `Baseline ${result.baselinePath}`,
      ],
    }),
    sections: [
      {
        label: "Candidate baseline",
        lines: [
          `Version: ${result.candidateEnvelope?.metadata?.version || result.pack?.baselineMetadata?.version || "baseline_v1"}`,
          `Owner: ${result.candidateEnvelope?.metadata?.owner || result.pack?.baselineMetadata?.owner || "owner_local_operator"}`,
          `Reason: ${result.candidateEnvelope?.metadata?.reason || result.pack?.baselineMetadata?.reason || "Shared mandate baseline."}`,
          `Replay newly blocked: ${result.replay?.counts?.newlyBlocked || 0}`,
          `Replay still blocked: ${result.replay?.counts?.stillBlocked || 0}`,
          `Replay now clears: ${result.replay?.counts?.nowClears || 0}`,
          ...(result.historyPath ? [`History: ${result.historyPath}`] : []),
          ...(result.baselineHistoryPath ? [`Baseline history: ${result.baselineHistoryPath}`] : []),
        ],
      },
      ...(Array.isArray(result.diffLines) && result.diffLines.length ? [{
        label: "Baseline diff",
        lines: result.diffLines.slice(0, 8),
      }] : []),
      ...((result.replay?.rows || []).length ? [{
        label: "Replay preview",
        lines: result.replay.rows.slice(0, 6).map((row) => `- ${row.recordedAt} | ${row.actionClass} | ${row.currentStatus} -> ${row.candidateStatus} | ${row.outcome}`),
      }] : []),
    ],
    footer: [
      result.applied
        ? "Next step: run --team-trust-panel or --repo-snapshot to verify the new baseline version."
        : "Next step: rerun with --apply to write this baseline after reviewing the replay impact.",
    ],
  });
}

export async function previewBaselineRollback(targetVersion = "previous", options = {}) {
  const active = await buildActiveMandate(options.shield || "cursor", options);
  const history = await readBaselineHistoryEntries({
    ...options,
    projectScope: active.projectScope || null,
  });
  const currentVersion = active.baselineMetadata?.version || "";
  const target = String(targetVersion || "previous").trim() || "previous";
  const targetEntry = target === "previous"
    ? (history.entries || []).find((entry) => String(entry?.version || "").trim() && String(entry?.version || "").trim() !== currentVersion)
    : (history.entries || []).find((entry) => String(entry?.version || "").trim() === target);
  if (!targetEntry?.baselineEnvelope) {
    throw new Error("No rollback baseline version found.");
  }
  const candidateEnvelope = normalizeBaselineEnvelope(targetEntry.baselineEnvelope, options);
  const candidateMandate = buildEffectiveMandateFromState(options.shield || "cursor", {
    ...options,
    projectScope: active.projectScope || null,
    baselineEnvelope: candidateEnvelope,
    storedMandate: active.storedMandate,
  });
  const replay = await buildBaselineReplayComparison(active.mandate, candidateMandate, options);
  return {
    applied: false,
    baselinePath: active.baselinePath,
    currentVersion,
    targetVersion: targetEntry.version,
    targetEntry,
    candidateEnvelope,
    diffLines: buildMandateDiffLines(active.storedBaseline || {}, candidateEnvelope.baseline),
    replay,
  };
}

export async function rollbackBaseline(targetVersion = "previous", options = {}) {
  const preview = await previewBaselineRollback(targetVersion, options);
  if (!options.apply) return preview;
  await fsp.mkdir(path.dirname(preview.baselinePath), { recursive: true });
  await fsp.writeFile(preview.baselinePath, `${JSON.stringify(preview.candidateEnvelope, null, 2)}\n`, "utf8");
  const baselineHistory = await appendBaselineHistoryEntry({
    action: "baseline_rollback",
    summary: `Rolled back the shared baseline to "${preview.targetVersion}".`,
    baselinePath: preview.baselinePath,
    reviewState: preview.candidateEnvelope?.metadata?.reviewState || "pending",
    projectScope: preview.targetEntry?.projectScope || null,
    baselineEnvelope: preview.candidateEnvelope,
  }, {
    ...options,
    projectScope: preview.targetEntry?.projectScope || null,
  });
  const mandateHistory = await appendMandateHistoryEntry({
    action: "baseline_rollback",
    summary: `Rolled back the baseline to "${preview.targetVersion}".`,
    mandatePath: resolveMandatePath(options, preview.targetEntry?.projectScope || null),
    diffLines: preview.diffLines || [],
    projectScope: preview.targetEntry?.projectScope || null,
  }, {
    ...options,
    baselinePath: preview.baselinePath,
    projectScope: preview.targetEntry?.projectScope || null,
  });
  return {
    ...preview,
    applied: true,
    historyPath: mandateHistory.historyPath,
    baselineHistoryPath: baselineHistory.historyPath,
  };
}

export function renderBaselineRollback(result = {}) {
  return renderSurface({
    hero: renderHero({
      status: result.applied ? "BASELINE ROLLBACK" : "BASELINE ROLLBACK PREVIEW",
      lines: [
        `Baseline ${result.baselinePath}`,
        `Current ${result.currentVersion || "none"} | Target ${result.targetVersion || "none"}`,
      ],
    }),
    sections: [
      {
        label: "Replay impact",
        lines: [
          `Replay newly blocked: ${result.replay?.counts?.newlyBlocked || 0}`,
          `Replay now clears: ${result.replay?.counts?.nowClears || 0}`,
          ...(result.historyPath ? [`History: ${result.historyPath}`] : []),
          ...(result.baselineHistoryPath ? [`Baseline history: ${result.baselineHistoryPath}`] : []),
        ],
      },
      ...(Array.isArray(result.diffLines) && result.diffLines.length ? [{
        label: "Rollback diff",
        lines: result.diffLines.slice(0, 8),
      }] : []),
    ],
    footer: [
      result.applied
        ? "Next step: run --team-trust-panel to confirm the rolled-back baseline posture."
        : "Next step: rerun with --apply to roll back to this baseline version.",
    ],
  });
}

export async function applyMandateSuggestion(suggestion = {}, options = {}) {
  const mandatePath = resolveMandatePath(
    {
      ...options,
      mandatePath: suggestion?.mandatePath || options?.mandatePath || "",
    },
    suggestion?.projectScope || options?.projectScope || null,
  );
  const nextMandate = isObject(suggestion?.nextMandate) ? suggestion.nextMandate : null;
  if (!nextMandate) {
    throw new Error("Mandate suggestion is missing the next mandate snapshot.");
  }
  const existed = fileExists(mandatePath);
  await fsp.mkdir(path.dirname(mandatePath), { recursive: true });
  await fsp.writeFile(mandatePath, `${JSON.stringify(nextMandate, null, 2)}\n`, "utf8");
  const history = await appendMandateHistoryEntry({
    action: "tighten_mandate",
    summary: String(suggestion?.summary || "Applied a tighter local mandate.").trim(),
    mandatePath,
    sourceRecordPath: String(options?.recordPath || "").trim(),
    diffLines: Array.isArray(suggestion?.diffLines) ? suggestion.diffLines : buildMandateDiffLines({}, nextMandate),
    projectScope: suggestion?.projectScope || options?.projectScope || null,
  }, {
    ...options,
    mandatePath,
    projectScope: suggestion?.projectScope || options?.projectScope || null,
  });
  return {
    applied: true,
    created: !existed,
    mandatePath,
    diffLines: Array.isArray(suggestion?.diffLines) ? suggestion.diffLines : buildMandateDiffLines({}, nextMandate),
    historyPath: history.historyPath,
    historyEntry: history.entry,
  };
}
