import { listDefendedRecordFiles, readDefendedRecord } from "../artifacts/write-record.js";
import { resolveRecordRootDir } from "./storage-paths.js";

function effectiveStatus(record = {}) {
  return String(
    record?.resolution?.finalStatus
    || record?.decision?.finalStatus
    || record?.decision?.status
    || "unknown",
  ).trim() || "unknown";
}

function safeActionClass(record = {}) {
  return String(record?.intent?.actionClass || "").trim();
}

function safeOperatorAction(record = {}) {
  return String(record?.resolution?.operatorAction || record?.operator?.resolvedAction || "").trim();
}

async function readRecentRecords(rootDir = "", limit = 36) {
  const files = await listDefendedRecordFiles(rootDir);
  const selected = files.slice(-Math.max(1, limit));
  const records = [];
  for (const filePath of selected) {
    try {
      records.push(await readDefendedRecord(filePath));
    } catch {
      // Keep lane memory resilient if one defended record is malformed.
    }
  }
  return records;
}

export async function buildLaneMemory(intent = {}, options = {}, projectScope = null) {
  const actionClass = String(intent?.actionClass || "").trim();
  const rootDir = resolveRecordRootDir(options, projectScope);
  if (!actionClass) {
    return {
      actionClass: "unknown",
      totalPrior: 0,
      rootDir,
      entries: [],
    };
  }

  const records = await readRecentRecords(rootDir);
  const laneRecords = records
    .filter((record) => safeActionClass(record) === actionClass)
    .slice(-6);

  const counts = {
    blocked: 0,
    tighten_mandate: 0,
    approved_once: 0,
    approved: 0,
    shadow_pass: 0,
    unknown: 0,
  };

  const entries = laneRecords
    .map((record) => {
      const status = effectiveStatus(record);
      counts[status] = (counts[status] || 0) + 1;
      return {
        recordedAt: String(record?.generatedAt || "").trim(),
        status,
        operatorAction: safeOperatorAction(record),
        reason: String(record?.decision?.primaryReason || "").trim(),
      };
    })
    .reverse();

  const lastEntry = entries[0] || null;
  return {
    actionClass,
    totalPrior: laneRecords.length,
    seenBefore: laneRecords.length > 0,
    rootDir,
    lastEntry,
    counts,
    entries,
    summary: laneRecords.length > 0
      ? `Seen ${laneRecords.length} prior defended record${laneRecords.length === 1 ? "" : "s"} for this lane.`
      : "First defended record for this lane.",
  };
}
