import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { listDefendedRecordFiles, readDefendedRecord } from "../artifacts/write-record.js";
import {
  applyMandateSuggestion,
  buildActiveMandate,
  buildMandateDiffLines,
  buildMandateSuggestionArtifacts,
  buildProjectScopedMandatePatch,
  mandateNeedsProjectScope,
} from "./mandate-state.js";
import {
  pickByDensity,
  renderHero,
  renderSurface,
  terminalDensityFlags,
} from "./terminal-theme.js";
import { formatDisplayPath, formatDisplayPathList, resolveRecordRootDir } from "./storage-paths.js";

const LEARNED_MANDATE_KIND = "nornr.sentry.learned_mandate.v1";
const LEARNER_STATE_KIND = "nornr.sentry.learned_mandate_state.v1";
const DEFAULT_WINDOW_MINUTES = 10;
const MINIMUM_CLEAR_RECORDS = 3;
const CLEAR_STATUSES = new Set(["approved", "approved_once", "shadow_pass"]);

function fileExists(candidate = "") {
  try {
    fs.accessSync(candidate);
    return true;
  } catch {
    return false;
  }
}

function effectiveStatus(record = {}) {
  return String(
    record?.resolution?.finalStatus
      || record?.decision?.finalStatus
      || record?.decision?.status
      || "unknown",
  ).trim() || "unknown";
}

function readWindowMinutes(options = {}) {
  const candidate = Number(options.learnerWindowMinutes || DEFAULT_WINDOW_MINUTES);
  if (!Number.isFinite(candidate) || candidate <= 0) return DEFAULT_WINDOW_MINUTES;
  return Math.max(1, Math.floor(candidate));
}

function resolveLearnedMandatePath(projectScope = null) {
  if (projectScope?.rootDir) {
    return path.join(projectScope.rootDir, ".nornr", "sentry-learned-mandate.json");
  }
  return path.join(process.cwd(), ".nornr", "sentry-learned-mandate.json");
}

function resolveLearnedMandateStatePath(projectScope = null) {
  if (projectScope?.rootDir) {
    return path.join(projectScope.rootDir, ".nornr", "sentry-learned-mandate-state.json");
  }
  return path.join(process.cwd(), ".nornr", "sentry-learned-mandate-state.json");
}

function parseTimestamp(value = "") {
  const timestamp = Date.parse(String(value || "").trim());
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isReadTool(tool = "") {
  const normalized = String(tool || "").trim().toLowerCase();
  return normalized.includes("read")
    || normalized.includes("search")
    || normalized.includes("list")
    || normalized.includes("glob");
}

function isWriteTool(tool = "") {
  const normalized = String(tool || "").trim().toLowerCase();
  return normalized.includes("write");
}

function resolveIntentPath(intentPath = "", projectRoot = "") {
  const candidate = String(intentPath || "").trim();
  if (!candidate || !projectRoot) return "";
  const resolved = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(projectRoot, candidate);
  if (resolved === projectRoot || resolved.startsWith(`${projectRoot}${path.sep}`)) {
    return resolved;
  }
  return "";
}

function collapseObservedScope(resolvedPath = "", projectRoot = "") {
  if (!resolvedPath || !projectRoot) return "";
  const relative = path.relative(projectRoot, resolvedPath);
  if (!relative || relative === "") return projectRoot;
  const [firstSegment] = relative.split(path.sep).filter(Boolean);
  return firstSegment ? path.join(projectRoot, firstSegment) : projectRoot;
}

function dedupePaths(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))).sort();
}

function buildSuggestionPatch(active = {}, observed = {}) {
  const patch = {};
  if (observed.readPaths?.length) {
    patch.paths = {
      ...(patch.paths || {}),
      read: observed.readPaths,
    };
  }
  if (observed.writePaths?.length) {
    patch.paths = {
      ...(patch.paths || {}),
      write: observed.writePaths,
    };
  }
  if (mandateNeedsProjectScope(active.mandate, active.projectScope)) {
    Object.assign(patch, buildProjectScopedMandatePatch(active.mandate, active.projectScope));
  }
  return patch;
}

function summarizeLearnerReason(status = "", counts = {}) {
  if (status === "insufficient_evidence") {
    return `Need at least ${MINIMUM_CLEAR_RECORDS} cleared records across ${counts.windowMinutes || DEFAULT_WINDOW_MINUTES} minutes before suggesting a tighter mandate.`;
  }
  if (status === "no_change") {
    return "Current mandate already matches observed in-project usage.";
  }
  return "Observed usage supports a tighter local mandate for this project.";
}

async function readLearnerState(projectScope = null) {
  const statePath = resolveLearnedMandateStatePath(projectScope);
  if (!fileExists(statePath)) {
    return {
      statePath,
      state: null,
    };
  }
  return {
    statePath,
    state: JSON.parse(await fsp.readFile(statePath, "utf8")),
  };
}

async function writeLearnerState(projectScope = null, state = {}) {
  const statePath = resolveLearnedMandateStatePath(projectScope);
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return statePath;
}

async function writeLearnedMandateArtifact(result = {}) {
  const artifactPath = resolveLearnedMandatePath(result.projectScope || null);
  const artifact = {
    kind: LEARNED_MANDATE_KIND,
    generatedAt: new Date().toISOString(),
    projectScope: result.projectScope || null,
    windowMinutes: result.windowMinutes,
    observed: result.observed,
    counts: result.counts,
    summary: result.summary,
    reason: result.reason,
    diffLines: result.diffLines,
    nextMandate: result.nextMandate,
    fingerprint: result.fingerprint,
  };
  await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
  await fsp.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return {
    artifactPath,
    artifact,
  };
}

export async function buildLearnedMandate(options = {}) {
  const active = await buildActiveMandate(options.shield || "cursor", options);
  const recordRootDir = resolveRecordRootDir(options, active.projectScope);
  const windowMinutes = readWindowMinutes(options);
  const recordFiles = await listDefendedRecordFiles(recordRootDir);
  const records = await Promise.all(recordFiles.map((filePath) => readDefendedRecord(filePath)));
  const sortedRecords = records
    .map((record) => ({
      record,
      recordedAtMs: parseTimestamp(record?.generatedAt),
    }))
    .filter((entry) => entry.recordedAtMs > 0)
    .sort((left, right) => left.recordedAtMs - right.recordedAtMs);

  const latestRecordedAt = sortedRecords[sortedRecords.length - 1]?.recordedAtMs || 0;
  const windowEntries = [];
  for (let index = sortedRecords.length - 1; index >= 0; index -= 1) {
    windowEntries.unshift(sortedRecords[index]);
    const spanMinutes = latestRecordedAt
      ? Math.max(0, Math.round((latestRecordedAt - windowEntries[0].recordedAtMs) / 60000))
      : 0;
    if (spanMinutes >= windowMinutes && windowEntries.length >= MINIMUM_CLEAR_RECORDS) {
      break;
    }
  }
  const windowRecords = windowEntries.map((entry) => entry.record);
  const clearRecords = windowRecords.filter((record) => CLEAR_STATUSES.has(effectiveStatus(record)));
  const clearTimestamps = clearRecords.map((record) => parseTimestamp(record?.generatedAt)).filter((value) => value > 0);
  const observedMinutes = clearTimestamps.length >= 2
    ? Math.max(0, Math.round((Math.max(...clearTimestamps) - Math.min(...clearTimestamps)) / 60000))
    : 0;

  const observedReadPaths = [];
  const observedWritePaths = [];
  const observedTools = new Set();
  for (const record of clearRecords) {
    const tool = String(record?.intent?.tool || "").trim();
    const resolvedIntentPath = resolveIntentPath(record?.intent?.path || "", active.projectScope?.rootDir || "");
    const collapsedPath = collapseObservedScope(resolvedIntentPath, active.projectScope?.rootDir || "");
    if (!collapsedPath) continue;
    if (isReadTool(tool)) {
      observedReadPaths.push(collapsedPath);
      observedTools.add(tool);
      continue;
    }
    if (isWriteTool(tool)) {
      observedWritePaths.push(collapsedPath);
      observedTools.add(tool);
    }
  }

  const observed = {
    readPaths: dedupePaths(observedReadPaths),
    writePaths: dedupePaths(observedWritePaths),
    tools: Array.from(observedTools).sort(),
  };
  const suggestionPatch = buildSuggestionPatch(active, observed);
  const artifacts = buildMandateSuggestionArtifacts(active.mandate, suggestionPatch, {
    mandatePath: active.mandatePath,
    projectScope: active.projectScope || null,
  });
  const diffLines = buildMandateDiffLines(active.mandate, artifacts.nextMandate);
  const status = clearRecords.length >= MINIMUM_CLEAR_RECORDS && observedMinutes >= windowMinutes && diffLines.length
    ? "ready"
    : (diffLines.length ? "insufficient_evidence" : "no_change");
  const summary = status === "ready"
    ? `Observed usage narrowed this mandate to ${(observed.readPaths || []).join(", ") || "(current read scope)"} for reads and ${(observed.writePaths || []).join(", ") || "(current write scope)"} for writes.`
    : "No learned mandate is ready yet.";
  const fingerprint = diffLines.join(" | ");

  return {
    kind: LEARNED_MANDATE_KIND,
    generatedAt: new Date().toISOString(),
    projectScope: active.projectScope || null,
    mandatePath: active.mandatePath,
    windowMinutes,
    status,
    ready: status === "ready",
    summary,
    reason: summarizeLearnerReason(status, {
      windowMinutes,
    }),
    counts: {
      totalRecords: records.length,
      windowRecords: windowRecords.length,
      clearRecords: clearRecords.length,
      observedMinutes,
    },
    observed,
    diffLines,
    patch: suggestionPatch,
    nextMandate: artifacts.nextMandate,
    fingerprint,
  };
}

export function renderLearnedMandate(result = {}) {
  const { density, compact } = terminalDensityFlags();
  return renderSurface({
    hero: renderHero({
      status: "LEARNED MANDATE",
      lines: [
        pickByDensity({
          compact: `Mandate ready at ${formatDisplayPath(result.mandatePath, result)}`,
          standard: `Mandate ${formatDisplayPath(result.mandatePath, result)}`,
          wide: `Mandate ${formatDisplayPath(result.mandatePath, result)}`,
        }, density),
        pickByDensity({
          compact: `Window ${result.windowMinutes || DEFAULT_WINDOW_MINUTES}m | ${result.status || "no_change"}`,
          standard: `Status ${result.status || "no_change"} | Observed window ${result.windowMinutes || DEFAULT_WINDOW_MINUTES} minutes`,
          wide: `Status ${result.status || "no_change"} | Observed window ${result.windowMinutes || DEFAULT_WINDOW_MINUTES} minutes`,
        }, density),
      ],
    }),
    sections: [
      {
        label: "Observed usage",
        lines: [
          `Cleared records in window: ${result.counts?.clearRecords || 0}`,
          `Observed minutes: ${result.counts?.observedMinutes || 0}`,
          `Observed read scope: ${formatDisplayPathList(result.observed?.readPaths || [], result)}`,
          ...(!compact ? [`Observed write scope: ${formatDisplayPathList(result.observed?.writePaths || [], result)}`] : []),
        ],
      },
      {
        label: "Decision",
        lines: [
          `Reason: ${result.reason || ""}`,
          ...(((result.diffLines || []).slice(0, compact ? 4 : 8)).length
            ? ["Learned diff:", ...(result.diffLines || []).slice(0, compact ? 4 : 8)]
            : ["Learned diff: no boundary change suggested yet."]),
        ],
      },
    ],
    footer: [
      result.ready
        ? pickByDensity({
          compact: "Next step: rerun with --apply.",
          standard: "Next step: rerun with --apply to write this learned mandate.",
          wide: "Next step: rerun with --apply to write this learned mandate.",
        }, density)
        : pickByDensity({
          compact: "Next step: keep serving until enough clear evidence is captured.",
          standard: "Next step: keep serving until the learner has enough clear in-project evidence.",
          wide: "Next step: keep serving until the learner has enough clear in-project evidence.",
        }, density),
    ],
  });
}

export async function applyLearnedMandate(result = null, options = {}) {
  const learned = result?.kind === LEARNED_MANDATE_KIND ? result : await buildLearnedMandate(options);
  if (!learned.ready) {
    throw new Error("No learned mandate is ready to apply yet.");
  }
  const applied = await applyMandateSuggestion({
    kind: "nornr.sentry.mandate_suggestion.v1",
    summary: learned.summary,
    nextMandate: learned.nextMandate,
    diffLines: learned.diffLines,
    mandatePath: learned.mandatePath,
    projectScope: learned.projectScope || null,
  }, options);
  const { artifactPath } = await writeLearnedMandateArtifact(learned);
  const statePath = await writeLearnerState(learned.projectScope || null, {
    kind: LEARNER_STATE_KIND,
    updatedAt: new Date().toISOString(),
    lastSuggestedFingerprint: learned.fingerprint,
    lastSuggestedAt: new Date().toISOString(),
    lastAppliedFingerprint: learned.fingerprint,
    artifactPath,
  });
  return {
    learned,
    applied,
    artifactPath,
    statePath,
  };
}

export function renderAppliedLearnedMandate(result = {}) {
  const { density, compact } = terminalDensityFlags();
  return renderSurface({
    hero: renderHero({
      status: "LEARNED MANDATE APPLIED",
      lines: [
        `Mandate ${result.learned?.mandatePath || result.applied?.mandatePath || "unknown"}`,
        pickByDensity({
          compact: "Observed clear usage has been written back.",
          standard: "Observed clear usage has been written back into the local boundary.",
          wide: "Observed clear usage has been written back into the local boundary.",
        }, density),
      ],
    }),
    sections: [
      {
        label: "Artifacts",
        lines: [
          `Artifact: ${formatDisplayPath(result.artifactPath, result.learned || result)}`,
          ...(!compact ? [`State: ${formatDisplayPath(result.statePath, result.learned || result)}`] : []),
        ],
      },
      {
        label: "Observed scope",
        lines: [
          `Read scope: ${formatDisplayPathList(result.learned?.observed?.readPaths || [], result.learned || result)}`,
          `Write scope: ${formatDisplayPathList(result.learned?.observed?.writePaths || [], result.learned || result)}`,
        ],
      },
    ],
  });
}

export async function maybeSurfaceLearnedMandateSuggestion(options = {}) {
  const learned = await buildLearnedMandate(options);
  if (!learned.ready) {
    return {
      surfaced: false,
      learned,
      reason: learned.status,
    };
  }
  const { statePath, state } = await readLearnerState(learned.projectScope || null);
  if (String(state?.lastSuggestedFingerprint || "").trim() === learned.fingerprint) {
    return {
      surfaced: false,
      learned,
      reason: "already_surfaced",
      statePath,
    };
  }
  const { artifactPath } = await writeLearnedMandateArtifact(learned);
  await writeLearnerState(learned.projectScope || null, {
    kind: LEARNER_STATE_KIND,
    updatedAt: new Date().toISOString(),
    lastSuggestedFingerprint: learned.fingerprint,
    lastSuggestedAt: new Date().toISOString(),
    lastAppliedFingerprint: String(state?.lastAppliedFingerprint || "").trim(),
    artifactPath,
  });
  return {
    surfaced: true,
    learned,
    artifactPath,
    statePath,
  };
}

export function renderServeLearnerNotice(result = {}) {
  const { density, compact } = terminalDensityFlags();
  return renderSurface({
    hero: renderHero({
      status: "LEARNED MANDATE READY",
      lines: [
        pickByDensity({
          compact: "Observed clear usage supports a tighter boundary.",
          standard: `Artifact ${formatDisplayPath(result.artifactPath, result.learned || result)}`,
          wide: `Artifact ${formatDisplayPath(result.artifactPath, result.learned || result)}`,
        }, density),
        pickByDensity({
          compact: "Run --learned-mandate --apply to write it.",
          standard: "Observed clear usage supports a tighter local boundary.",
          wide: "Observed clear usage supports a tighter local boundary.",
        }, density),
      ],
    }),
    sections: [
      {
        label: "Observed scope",
        lines: [
          `Read scope: ${formatDisplayPathList(result.learned?.observed?.readPaths || [], result.learned || result)}`,
          ...(!compact ? [`Write scope: ${formatDisplayPathList(result.learned?.observed?.writePaths || [], result.learned || result)}`] : []),
        ],
      },
    ],
    footer: [
      pickByDensity({
        compact: "Next step: run --learned-mandate --apply.",
        standard: "Next step: run `node bin/nornr-sentry.js --client cursor --learned-mandate --apply` to write it.",
        wide: "Next step: run `node bin/nornr-sentry.js --client cursor --learned-mandate --apply` to write it.",
      }, density),
    ],
  });
}
