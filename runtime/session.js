import { buildClientAdapter } from "../adapters/clients.js";
import { writeDefendedRecord } from "../artifacts/write-record.js";
import { evaluateIntent } from "../decisions/evaluate.js";
import { classifyDemoIntent, classifyIncomingIntent } from "../intent/classify.js";
import { buildFastPathAllow } from "./fast-path.js";
import { buildActiveMandate } from "./mandate-state.js";
import { buildLaneMemory } from "./lane-memory.js";
import { resolveRecordRootDir } from "./storage-paths.js";

async function buildSessionFromIntent(intent, options = {}) {
  const adapter = buildClientAdapter(options.shield, options);
  const {
    mandate,
    mandatePath,
    projectScope,
    storedMandate,
  } = await buildActiveMandate(options.shield, options);
  const decision = evaluateIntent(intent, mandate);
  const fastPathAllow = options.fastPathAllow === false
    ? { eligible: false, reason: "Fast-path allow disabled for this runtime." }
    : buildFastPathAllow(intent, mandate);
  const recordRootDir = resolveRecordRootDir(options, projectScope);
  const laneMemory = await buildLaneMemory(intent, {
    ...options,
    recordRootDir,
  }, projectScope);
  const record = await writeDefendedRecord(
    {
      client: {
        shield: options.shield,
        label: adapter.clientLabel,
      },
      mandate,
      intent,
      decision,
      laneMemory,
      operator: {
        ownerId: options.ownerId,
        suggestedAction: decision.status === "blocked" ? "Block" : "Approve once",
      },
    },
    {
      rootDir: recordRootDir,
    },
  );

  return {
    adapter,
    mandate,
    mandatePath,
    intent,
    decision,
    record,
    projectScope,
    storedMandate,
    fastPathAllow,
    laneMemory,
    runtime: {
      screenshotMode: Boolean(options.screenshotMode),
      recordingMode: Boolean(options.recordingMode),
      recordRootDir,
    },
    statusLine:
      decision.status === "blocked"
        ? "Sentry active. Dangerous action stopped before becoming real."
        : "Sentry active. Current action can clear under the active mandate.",
  };
}

export async function buildSentrySession(options = {}) {
  return buildSessionFromIntent(classifyDemoIntent(options.demo), options);
}

export async function buildSentrySessionFromAction(action = {}, options = {}) {
  return buildSessionFromIntent(classifyIncomingIntent(action), options);
}
