import {
  applyMandateSuggestion,
  buildMandateSuggestionArtifacts,
  buildProjectScopedMandatePatch,
  mandateNeedsProjectScope,
} from "./mandate-state.js";
import { buildDecisionSupport } from "./decision-support.js";
import { rememberResolvedReview } from "./review-memory.js";
import { updateDefendedRecord } from "../artifacts/write-record.js";

function dedupe(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildMandateSuggestion(session, operatorAction) {
  if (operatorAction !== "Tighten mandate") return null;

  const nextBlockedTools = dedupe([...(session.mandate.tools?.blocked || []), session.intent.tool]);
  const nextBlockedActionClasses = dedupe([...(session.mandate.limits?.blockedActionClasses || []), session.intent.actionClass]);
  const nextApprovalActionClasses = dedupe(
    (session.mandate.limits?.approvalActionClasses || []).filter((entry) => entry !== session.intent.actionClass),
  );
  const patch = {
    tools: {
      blocked: nextBlockedTools,
    },
    limits: {
      blockedActionClasses: nextBlockedActionClasses,
      approvalActionClasses: nextApprovalActionClasses,
    },
  };
  if (mandateNeedsProjectScope(session.mandate, session.projectScope)) {
    Object.assign(patch, buildProjectScopedMandatePatch(session.mandate, session.projectScope));
  }
  const artifacts = buildMandateSuggestionArtifacts(session.mandate, patch, {
    mandatePath: session.mandatePath || session.mandate?.storage?.mandatePath || "",
    projectScope: session.projectScope || null,
  });
  const summaryParts = [
    `Add "${session.intent.tool}" and "${session.intent.actionClass}" to the blocked lane for this mandate.`,
  ];
  if (mandateNeedsProjectScope(session.mandate, session.projectScope)) {
    summaryParts.push(`Scope the mandate to "${session.projectScope?.projectName || "this project"}" before the lane clears again.`);
  }

  return {
    kind: "nornr.sentry.mandate_suggestion.v1",
    summary: summaryParts.join(" "),
    patch,
    nextMandate: artifacts.nextMandate,
    diffLines: artifacts.diffLines,
    mandatePath: artifacts.mandatePath,
    projectScope: session.projectScope || null,
  };
}

function buildStatusLine(baseStatusLine, operatorAction) {
  if (operatorAction === "Let action clear") {
    return `${baseStatusLine} | Action cleared under the current mandate.`;
  }
  if (operatorAction === "Approve once") {
    return `${baseStatusLine} | Approved once for the current request.`;
  }
  if (operatorAction === "Remote approve once") {
    return `${baseStatusLine} | Approved once from the remote approval handoff.`;
  }
  if (operatorAction === "Remote hold") {
    return `${baseStatusLine} | Remote operator kept the lane blocked for now.`;
  }
  if (operatorAction === "Remote block") {
    return `${baseStatusLine} | Remote operator blocked the lane before it became real.`;
  }
  if (operatorAction === "Shadow watch") {
    return `${baseStatusLine} | Shadow mode observed the lane and would have stopped it under enforcement.`;
  }
  if (operatorAction === "Tighten mandate") {
    return `${baseStatusLine} | Mandate tightening suggested before the lane clears again.`;
  }
  if (operatorAction === "Quit") {
    return `${baseStatusLine} | Operator exited review without allowing the action.`;
  }
  return `${baseStatusLine} | Action remained blocked.`;
}

function finalStatusFor(operatorAction) {
  if (operatorAction === "Let action clear") return "approved";
  if (operatorAction === "Approve once" || operatorAction === "Remote approve once") return "approved_once";
  if (operatorAction === "Shadow watch") return "shadow_pass";
  if (operatorAction === "Tighten mandate") return "tighten_mandate";
  return "blocked";
}

export function finalizeResolution(session, operatorAction) {
  return {
    ...session,
    operatorAction,
    statusLine: buildStatusLine(session.statusLine, operatorAction),
    mandateSuggestion: buildMandateSuggestion(session, operatorAction),
    decision: {
      ...session.decision,
      finalStatus: finalStatusFor(operatorAction),
    },
  };
}

export async function persistResolvedSession(session, operatorAction, options = {}) {
  let resolution = finalizeResolution(session, operatorAction);
  let mandateApply = null;
  if (resolution.operatorAction === "Tighten mandate" && resolution.mandateSuggestion) {
    mandateApply = await applyMandateSuggestion(resolution.mandateSuggestion, {
      mandatePath: resolution.mandateSuggestion.mandatePath || resolution.mandatePath || options.mandatePath || "",
      projectScope: resolution.projectScope || null,
      recordPath: resolution.record?.filePath || "",
    });
    resolution = {
      ...resolution,
      mandateApply,
      statusLine: `${resolution.statusLine} | Local mandate updated at ${mandateApply.mandatePath}.`,
    };
  }

  const decisionSupport = buildDecisionSupport(
    resolution.intent,
    resolution.decision,
    resolution.mandate,
    resolution.laneMemory,
    options,
  );
  const recordPatch = options.recordPatch && typeof options.recordPatch === "object" ? options.recordPatch : {};
  const resolutionPatch = recordPatch.resolution && typeof recordPatch.resolution === "object" ? recordPatch.resolution : {};
  const restRecordPatch = { ...recordPatch };
  delete restRecordPatch.resolution;
  const updatedRecord = await updateDefendedRecord(resolution.record.filePath, {
    decision: resolution.decision,
    decisionSupport,
    laneMemory: resolution.laneMemory,
    operator: {
      resolvedAction: resolution.operatorAction,
    },
    resolution: {
      operatorAction: resolution.operatorAction,
      finalStatus: resolution.decision.finalStatus,
      statusLine: resolution.statusLine,
      mandateSuggestion: resolution.mandateSuggestion,
      mandateApply,
      ...resolutionPatch,
    },
    ...restRecordPatch,
  });

  const persisted = {
    ...resolution,
    record: {
      ...resolution.record,
      portablePath: updatedRecord.portablePath,
      portableRecord: updatedRecord.portableRecord,
      sharePath: updatedRecord.sharePath,
      sharePack: updatedRecord.sharePack,
    },
    decisionSupport,
  };

  await rememberResolvedReview(persisted, options).catch(() => null);
  return persisted;
}
