import fs from "node:fs/promises";
import path from "node:path";

import { listDefendedRecordFiles, readDefendedRecord } from "../artifacts/write-record.js";
import { buildLearnedMandate } from "./mandate-learner.js";
import { detectProjectScope } from "./mandate-state.js";
import { formatDisplayPath, resolveRecordRootDir } from "./storage-paths.js";

const SHADOW_CONVERSION_KIND = "nornr.sentry.shadow_conversion.v1";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function inferProjectScope(options = {}) {
  return options.projectScope || detectProjectScope(options.projectRoot || options.cwd || process.cwd()) || null;
}

function resolveStorageRoot(options = {}, projectScope = null) {
  if (projectScope?.rootDir) return projectScope.rootDir;
  if (options.projectRoot) return path.resolve(options.projectRoot);
  return process.cwd();
}

export function resolveShadowConversionPath(options = {}, projectScope = null) {
  return path.join(resolveStorageRoot(options, projectScope), ".nornr", "sentry-shadow-conversion.json");
}

function resolveShadowConversionStatePath(options = {}, projectScope = null) {
  return path.join(resolveStorageRoot(options, projectScope), ".nornr", "sentry-shadow-conversion-state.json");
}

async function readJson(filePath = "", fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath = "", value = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

function effectiveResolutionStatus(record = {}) {
  return normalizeText(record?.resolution?.finalStatus || record?.decision?.finalStatus || record?.decision?.status || "");
}

function decisionWasBlocked(record = {}) {
  return normalizeText(record?.decision?.status || record?.decision?.finalStatus || "").toLowerCase() === "blocked";
}

function diffFingerprint(conversion = {}) {
  const latest = Array.isArray(conversion.latestExamples) ? conversion.latestExamples[0] : null;
  return [
    conversion.dangerousShadowCount || 0,
    conversion.observationMinutes || 0,
    latest?.generatedAt || "",
    latest?.actionClass || "",
  ].join(":");
}

export async function buildShadowConversion(options = {}) {
  const projectScope = inferProjectScope(options);
  const rootDir = resolveRecordRootDir(options, projectScope);
  const files = await listDefendedRecordFiles(rootDir);
  const records = [];
  for (const filePath of files) {
    try {
      records.push(await readDefendedRecord(filePath));
    } catch {
      // Keep the shadow conversion pack resilient if one record is malformed.
    }
  }

  records.sort((left, right) => String(left.generatedAt || "").localeCompare(String(right.generatedAt || "")));

  const latestExamples = [];
  const byActionClass = new Map();
  let firstAt = "";
  let lastAt = "";

  for (const record of records) {
    if (effectiveResolutionStatus(record) !== "shadow_pass" || !decisionWasBlocked(record)) {
      continue;
    }
    if (!firstAt) firstAt = record.generatedAt;
    lastAt = record.generatedAt;
    const actionClass = normalizeText(record?.intent?.actionClass || "unknown");
    byActionClass.set(actionClass, (byActionClass.get(actionClass) || 0) + 1);
    latestExamples.unshift({
      generatedAt: record.generatedAt,
      actionClass,
      title: normalizeText(record?.intent?.title || actionClass),
      reason: normalizeText(record?.decision?.primaryReason || record?.resolution?.statusLine || ""),
      counterparty: normalizeText(record?.intent?.counterparty || ""),
    });
  }

  const observationMinutes = firstAt && lastAt
    ? Math.max(0, Math.round((new Date(lastAt).getTime() - new Date(firstAt).getTime()) / 60000))
    : 0;
  const dangerousShadowCount = Array.from(byActionClass.values()).reduce((sum, value) => sum + value, 0);
  const topLanes = Array.from(byActionClass.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([actionClass, count]) => ({ actionClass, count }));
  const learnedMandate = await buildLearnedMandate(options).catch(() => ({
    ready: false,
    diffLines: [],
    reason: "learner_unavailable",
  }));
  const ready = dangerousShadowCount >= 5 || (observationMinutes >= 60 && dangerousShadowCount >= 3);
  const recommendedCommand = [
    "node integrations/nornr-sentry/bin/nornr-sentry.js",
    `--client ${normalizeText(options.shield || "cursor") || "cursor"}`,
    "--serve",
  ].join(" ");
  const conversion = {
    kind: SHADOW_CONVERSION_KIND,
    generatedAt: new Date().toISOString(),
    projectScope,
    rootDir,
    dangerousShadowCount,
    observationMinutes,
    ready,
    topLanes,
    latestExamples: latestExamples.slice(0, 5),
    learnedMandateReady: Boolean(learnedMandate?.ready),
    learnedDiffLines: Array.isArray(learnedMandate?.diffLines) ? learnedMandate.diffLines.slice(0, 6) : [],
    nextAction: ready
      ? "Turn off shadow mode and let the local airbag enforce the boundary."
      : "Keep observing until shadow mode has enough dangerous evidence to justify enforcement.",
    recommendedCommand: ready
      ? `${recommendedCommand} # rerun without --shadow-mode`
      : `${recommendedCommand} --shadow-mode`,
  };
  const packPath = resolveShadowConversionPath(options, projectScope);
  await writeJson(packPath, conversion);
  return {
    ...conversion,
    packPath,
    fingerprint: diffFingerprint(conversion),
  };
}

export function renderShadowConversion(conversion = {}) {
  const lines = [
    "NORNR Sentry shadow conversion",
    `Dangerous intents seen in shadow: ${conversion.dangerousShadowCount || 0}`,
    `Observation window: ${conversion.observationMinutes || 0} minutes`,
    `Ready to enforce: ${conversion.ready ? "yes" : "no"}`,
    `Learned mandate ready: ${conversion.learnedMandateReady ? "yes" : "no"}`,
    `Next action: ${conversion.nextAction || ""}`,
    "",
  ];

  if ((conversion.topLanes || []).length) {
    lines.push("Top shadow lanes:");
    conversion.topLanes.forEach((lane) => {
      lines.push(`- ${lane.actionClass}: ${lane.count}`);
    });
    lines.push("");
  }

  if ((conversion.latestExamples || []).length) {
    lines.push("Latest dangerous shadow examples:");
    conversion.latestExamples.forEach((example) => {
      lines.push(`- ${example.actionClass}: ${example.title}`);
    });
    lines.push("");
  }

  if ((conversion.learnedDiffLines || []).length) {
    lines.push("Learned boundary diff:");
    conversion.learnedDiffLines.forEach((line) => {
      lines.push(`- ${line}`);
    });
    lines.push("");
  }

  lines.push(`Record root: ${formatDisplayPath(conversion.rootDir, conversion)}`);
  lines.push(`Recommended command: ${conversion.recommendedCommand || ""}`);
  return lines.join("\n");
}

export async function maybeSurfaceShadowConversionNotice(options = {}) {
  if (!options?.serve || !options?.shadowMode) {
    return {
      surfaced: false,
      reason: "shadow_mode_not_enabled",
    };
  }
  const conversion = await buildShadowConversion(options);
  if (!conversion.ready) {
    return {
      surfaced: false,
      reason: "not_ready",
      conversion,
    };
  }
  const statePath = resolveShadowConversionStatePath(options, conversion.projectScope || null);
  const state = await readJson(statePath, {});
  if (normalizeText(state?.lastFingerprint) === normalizeText(conversion.fingerprint)) {
    return {
      surfaced: false,
      reason: "already_surfaced",
      conversion,
    };
  }
  await writeJson(statePath, {
    kind: "nornr.sentry.shadow_conversion_state.v1",
    updatedAt: new Date().toISOString(),
    lastFingerprint: conversion.fingerprint,
  });
  return {
    surfaced: true,
    reason: "ready",
    conversion,
  };
}

export function renderShadowConversionNotice(result = {}) {
  const conversion = result.conversion || {};
  return [
    "NORNR Sentry shadow mode report",
    `I saw ${conversion.dangerousShadowCount || 0} dangerous intents that would have been stopped.`,
    `Observation window: ${conversion.observationMinutes || 0} minutes.`,
    `Top lanes: ${(conversion.topLanes || []).map((entry) => `${entry.actionClass} (${entry.count})`).join(", ") || "none yet"}`,
    conversion.learnedMandateReady
      ? "A tighter learned mandate is also ready if you want to narrow the repo boundary before you enforce."
      : "The current mandate can already move from watch mode to enforcement.",
    `Next: ${conversion.recommendedCommand || "rerun serve without --shadow-mode"}`,
  ].join("\n");
}
