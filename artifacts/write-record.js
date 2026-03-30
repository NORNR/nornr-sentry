import fs from "node:fs/promises";
import path from "node:path";
import {
  pickByDensity,
  renderHero,
  renderSurface,
  terminalDensityFlags,
} from "../runtime/terminal-theme.js";

function sanitize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildPortablePath(filePath = "") {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, "portable", `${parsed.name}.portable.json`);
}

function buildSharePath(filePath = "") {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, "share", `${parsed.name}.share.json`);
}

export function buildPortablePathForRecord(filePath = "") {
  return buildPortablePath(filePath);
}

export function buildSharePathForRecord(filePath = "") {
  return buildSharePath(filePath);
}

function mergeEnvelope(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return base;
  }

  const next = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value) && next[key] && typeof next[key] === "object" && !Array.isArray(next[key])) {
      next[key] = mergeEnvelope(next[key], value);
      return;
    }
    next[key] = value;
  });
  return next;
}

function buildRecordId(filePath = "") {
  const parsed = path.parse(filePath || "record");
  const rawName = String(parsed.name || "").trim();
  const matched = rawName.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(.*)$/);
  if (matched) {
    const stamp = matched[1].replace(/[^0-9]/g, "").slice(-6);
    const slug = sanitize(matched[2]).slice(0, 18) || "local";
    return `nornr-rec-${slug}-${stamp}`;
  }
  const normalized = sanitize(rawName);
  if (!normalized) return "nornr-rec-local";
  if (normalized.length <= 24) return `nornr-rec-${normalized}`;
  return `nornr-rec-${normalized.slice(0, 12)}-${normalized.slice(-8)}`;
}

function buildPortableDefendedRecord(envelope = {}, filePath = "") {
  return {
    kind: "nornr.sentry.portable_record.v1",
    exportedAt: new Date().toISOString(),
    recordId: buildRecordId(filePath),
    recordPath: filePath,
    intent: envelope.intent || null,
    mandate: envelope.mandate || null,
    verdict:
      envelope.resolution?.finalStatus
      || envelope.decision?.finalStatus
      || envelope.decision?.status
      || "blocked",
    reason:
      envelope.resolution?.statusLine
      || envelope.decision?.primaryReason
      || "",
    operatorAction: envelope.resolution?.operatorAction || envelope.operator?.resolvedAction || "",
    reasonDetails: envelope.decision?.reasonDetails || [],
    suggestedTightenDiff: envelope.resolution?.mandateSuggestion?.diffLines || [],
    timestamp: envelope.generatedAt || new Date().toISOString(),
  };
}

function buildDefendedRecordSharePack(envelope = {}, filePath = "", portablePath = "") {
  const verdict =
    envelope.resolution?.finalStatus
    || envelope.decision?.finalStatus
    || envelope.decision?.status
    || "blocked";
  const reason =
    envelope.resolution?.statusLine
    || envelope.decision?.primaryReason
    || "";
  const title = String(envelope.intent?.title || envelope.intent?.actionClass || "defended record").trim() || "defended record";
  const operatorAction = envelope.resolution?.operatorAction || envelope.operator?.resolvedAction || "";
  const recordId = buildRecordId(filePath);
  const headline = `${verdict}: ${title}`;
  const shareSummary = `Policy decision: ${verdict}. Reason: ${reason}`.trim();
  return {
    kind: "nornr.sentry.record_share.v1",
    exportedAt: new Date().toISOString(),
    recordId,
    recordPath: filePath,
    portableRecordPath: portablePath,
    verdict,
    reason,
    headline,
    artifactSummary: `Defended record ${recordId} preserves the ${verdict} decision for ${title}.`,
    shareSummary,
    timestamp: envelope.generatedAt || new Date().toISOString(),
    intent: envelope.intent || null,
    reasonDetails: envelope.decision?.reasonDetails || [],
    mandateDiff: envelope.resolution?.mandateSuggestion?.diffLines || [],
    operatorAction,
    shareLines: [
      headline,
      `Defended record: ${recordId}`,
      shareSummary,
      `Operator action: ${operatorAction || "none"}`,
    ],
  };
}

async function writePortableRecord(filePath = "", portableRecord = {}) {
  const portablePath = buildPortablePath(filePath);
  await fs.mkdir(path.dirname(portablePath), { recursive: true });
  await fs.writeFile(portablePath, `${JSON.stringify(portableRecord, null, 2)}\n`, "utf8");
  return portablePath;
}

async function writeShareRecord(filePath = "", sharePack = {}) {
  const sharePath = buildSharePath(filePath);
  await fs.mkdir(path.dirname(sharePath), { recursive: true });
  await fs.writeFile(sharePath, `${JSON.stringify(sharePack, null, 2)}\n`, "utf8");
  return sharePath;
}

export async function readDefendedRecord(filePath = "") {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function listDefendedRecordFiles(rootDir = "") {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .filter((entry) => !entry.name.endsWith(".portable.json") && !entry.name.endsWith(".share.json"))
      .map((entry) => path.join(rootDir, entry.name))
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function exportDefendedRecordShare(options = {}) {
  const rootDir = options.rootDir || path.resolve(process.cwd(), "data", "records");
  let filePath = String(options.recordPath || "").trim();
  if (!filePath || filePath === "latest") {
    const files = await listDefendedRecordFiles(rootDir);
    filePath = files[files.length - 1] || "";
  }
  if (!filePath) {
    throw new Error("No defended records found to export.");
  }
  const envelope = await readDefendedRecord(filePath);
  const portablePath = buildPortablePath(filePath);
  const sharePack = buildDefendedRecordSharePack(envelope, filePath, portablePath);
  const sharePath = await writeShareRecord(filePath, sharePack);
  return {
    filePath,
    portablePath,
    sharePath,
    sharePack,
    portableRecord: await readDefendedRecord(portablePath),
  };
}

export function renderDefendedRecordShareExport(result = {}) {
  const { density, compact } = terminalDensityFlags();
  return renderSurface({
    hero: renderHero({
      status: "DEFENDED RECORD",
      lines: [
        `Proof ${result.sharePack?.recordId || "local"} · ${result.sharePack?.verdict || "blocked"}`,
        pickByDensity({
          compact: result.sharePack?.headline || "",
          standard: result.sharePack?.artifactSummary || result.sharePack?.headline || "",
          wide: result.sharePack?.artifactSummary || result.sharePack?.headline || "",
        }, density),
      ],
    }),
    sections: [
      {
        label: "Artifact",
        lines: [
          `Operator action: ${result.sharePack?.operatorAction || "none"}`,
          `Action class: ${result.sharePack?.intent?.actionClass || "unknown"}`,
          `${result.sharePack?.reason || ""}`,
        ],
      },
      {
        label: "Paths",
        lines: [
          `Record: ${result.filePath}`,
          ...(!compact ? [`Portable record: ${result.portablePath}`] : []),
          `Share pack: ${result.sharePath}`,
        ],
      },
      {
        label: "Review handoff",
        lines: [
          `Proof id: ${result.sharePack?.recordId || "local"}`,
          `Headline: ${result.sharePack?.headline || "Defended record"}`,
          "This object is the real local proof artifact, not a synthetic replay attack.",
        ],
      },
    ],
    footer: compact ? ["Share-ready proof was exported locally."] : ["Use this defended record for replay, review, or external proof. Use --policy-replay only for synthetic attack demos."],
  });
}

export async function writeDefendedRecord(payload, options = {}) {
  const rootDir = options.rootDir || path.resolve(process.cwd(), "data", "records");
  await fs.mkdir(rootDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = sanitize(payload?.intent?.actionClass || "record");
  const filePath = path.join(rootDir, `${stamp}-${base}.json`);
  const envelope = {
    kind: "nornr.sentry.record.v1",
    generatedAt: new Date().toISOString(),
    ...payload,
  };
  await fs.writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  const portableRecord = buildPortableDefendedRecord(envelope, filePath);
  const portablePath = await writePortableRecord(filePath, portableRecord);
  const sharePack = buildDefendedRecordSharePack(envelope, filePath, portablePath);
  const sharePath = await writeShareRecord(filePath, sharePack);
  return {
    filePath,
    envelope,
    portablePath,
    portableRecord,
    sharePath,
    sharePack,
  };
}

export async function updateDefendedRecord(filePath, patch = {}) {
  const existing = JSON.parse(await fs.readFile(filePath, "utf8"));
  const envelope = mergeEnvelope(existing, patch);
  await fs.writeFile(filePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  const portableRecord = buildPortableDefendedRecord(envelope, filePath);
  const portablePath = await writePortableRecord(filePath, portableRecord);
  const sharePack = buildDefendedRecordSharePack(envelope, filePath, portablePath);
  const sharePath = await writeShareRecord(filePath, sharePack);
  return {
    filePath,
    envelope,
    portablePath,
    portableRecord,
    sharePath,
    sharePack,
  };
}
