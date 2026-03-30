import { listDefendedRecordFiles, readDefendedRecord } from "../artifacts/write-record.js";
import { formatDisplayPath, resolveRecordRootDir } from "./storage-paths.js";
import { evaluateIntent } from "../decisions/evaluate.js";
import { buildActiveMandate } from "./mandate-state.js";
import {
  pickByDensity,
  renderHero,
  renderSurface,
  terminalDensityFlags,
} from "./terminal-theme.js";

function effectiveStatus(envelope = {}) {
  return String(
    envelope?.resolution?.finalStatus
    || envelope?.decision?.finalStatus
    || envelope?.decision?.status
    || "unknown",
  ).trim() || "unknown";
}

function classifyReplayOutcome(originalStatus = "", replayStatus = "") {
  const original = String(originalStatus || "").trim();
  const replay = String(replayStatus || "").trim();
  const originalBlocked = original === "blocked" || original === "tighten_mandate";
  const replayBlocked = replay === "blocked";
  if (originalBlocked && replayBlocked) return "still_blocked";
  if (originalBlocked && !replayBlocked) return "now_clears";
  if (!originalBlocked && replayBlocked) return "would_block_now";
  return "same_clear";
}

function replayOutcomeLabel(outcome = "") {
  if (outcome === "still_blocked") return "Still blocked";
  if (outcome === "now_clears") return "Now clears";
  if (outcome === "would_block_now") return "Would block now";
  return "Still clears";
}

export async function buildRecordReplay(options = {}) {
  const {
    mandate,
    mandatePath,
    projectScope,
  } = await buildActiveMandate(options.shield || "cursor", options);
  const rootDir = resolveRecordRootDir(options, projectScope);
  const files = await listDefendedRecordFiles(rootDir);
  const records = await Promise.all(files.slice(-12).map((filePath) => readDefendedRecord(filePath)));
  const rows = records.map((record) => {
    const replayDecision = evaluateIntent(record?.intent || {}, mandate);
    const originalStatus = effectiveStatus(record);
    const replayStatus = String(replayDecision?.status || "unknown").trim() || "unknown";
    return {
      recordPath: String(record?.resolution?.recordPath || record?.recordPath || "").trim() || String(record?.filePath || "").trim(),
      recordedAt: String(record?.generatedAt || "").trim(),
      actionClass: String(record?.intent?.actionClass || "").trim(),
      originalStatus,
      replayStatus,
      outcome: classifyReplayOutcome(originalStatus, replayStatus),
      reason: String(replayDecision?.primaryReason || "").trim(),
    };
  });
  const counts = {
    stillBlocked: rows.filter((row) => row.outcome === "still_blocked").length,
    nowClears: rows.filter((row) => row.outcome === "now_clears").length,
    wouldBlockNow: rows.filter((row) => row.outcome === "would_block_now").length,
    sameClear: rows.filter((row) => row.outcome === "same_clear").length,
  };
  return {
    kind: "nornr.sentry.record_replay.v1",
    generatedAt: new Date().toISOString(),
    mandatePath,
    projectScope,
    rootDir,
    counts,
    rows,
  };
}

export function renderRecordReplay(replay = {}) {
  const { density, compact } = terminalDensityFlags();
  return renderSurface({
    hero: renderHero({
      status: "LOCAL RECORD REPLAY",
      lines: [
        `Current mandate ${formatDisplayPath(replay.mandatePath, replay)}`,
        pickByDensity({
          compact: "Replaying recent defended records against the current local boundary.",
          standard: "Replaying recent defended records against the current local boundary.",
          wide: "Replaying recent defended records against the current local boundary so drift shows up before the next real action.",
        }, density),
      ],
    }),
    sections: [
      {
        label: "What changed",
        lines: [
          `Still blocked: ${replay.counts?.stillBlocked || 0}`,
          `Now clears: ${replay.counts?.nowClears || 0}`,
          ...(!compact ? [`Would block now: ${replay.counts?.wouldBlockNow || 0}`] : []),
          ...(!compact ? [`Still clears: ${replay.counts?.sameClear || 0}`] : []),
        ],
      },
      {
        label: "Real defended records",
        lines: (replay.rows || []).slice(0, compact ? 5 : 8).map((row) => `- ${row.recordedAt} | ${row.actionClass} | ${row.originalStatus} -> ${row.replayStatus} | ${replayOutcomeLabel(row.outcome)}`),
      },
    ],
    footer: compact ? [] : [
      `Record root: ${formatDisplayPath(replay.rootDir, replay)}`,
      "This replay uses real defended records from the local boundary, not synthetic attack demos.",
    ],
  });
}
