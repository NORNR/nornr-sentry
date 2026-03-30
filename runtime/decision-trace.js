function glyphFor(status) {
  if (status === "approved" || status === "approved_once") return "✓";
  if (status === "shadow_pass") return "~";
  return "!";
}

function compact(value = "", maxLength = 72) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function timeStamp(value = "") {
  const candidate = value ? new Date(value) : new Date();
  const valid = Number.isFinite(candidate.getTime()) ? candidate : new Date();
  return valid.toISOString().slice(11, 19);
}

function actionLabel(session = {}) {
  return compact(session?.intent?.title || session?.intent?.actionClass || "unknown_intent", 64);
}

function statusCounterKey(status = "") {
  const normalized = String(status || "").trim();
  if (normalized === "approved" || normalized === "approved_once") return "approved";
  if (normalized === "shadow_pass") return "shadowPass";
  return "blocked";
}

export function formatDecisionTrace(session, outcome = {}, options = {}) {
  const status = String(outcome.status || session?.decision?.finalStatus || session?.decision?.status || "unknown").trim() || "unknown";
  if (options.ambientTrust || options.recordingMode) {
    const reason = compact(outcome.primaryReason || session?.decision?.primaryReason || "", 86);
    const operatorAction = outcome.operatorAction ? ` / ${compact(outcome.operatorAction, 28)}` : "";
    return `[${timeStamp(outcome.recordedAt || session?.record?.generatedAt || "")}] ${glyphFor(status)} ${status} / ${session.intent.actionClass} / ${actionLabel(session)} / ${reason}${operatorAction}`;
  }
  const headline = `${glyphFor(status)} ${status} / ${session.intent.actionClass} / ${session.intent.title}`;
  const detail = `Reason: ${outcome.primaryReason || session.decision.primaryReason}`;
  const operator = outcome.operatorAction ? `Operator action: ${outcome.operatorAction}` : "";
  return [headline, detail, operator].filter(Boolean).join("\n");
}

export function createAmbientTrustTracker(options = {}) {
  const counters = {
    approved: 0,
    blocked: 0,
    shadowPass: 0,
  };
  let lastEvent = null;
  return {
    note(session, outcome = {}) {
      const status = String(outcome.status || session?.decision?.finalStatus || session?.decision?.status || "unknown").trim() || "unknown";
      const key = statusCounterKey(status);
      counters[key] += 1;
      lastEvent = {
        status,
        actionClass: String(session?.intent?.actionClass || "unknown").trim() || "unknown",
        title: actionLabel(session),
        reason: compact(outcome.primaryReason || session?.decision?.primaryReason || "", 72),
        operatorAction: compact(outcome.operatorAction || "", 24),
        recordedAt: new Date().toISOString(),
      };
    },
    snapshot() {
      return {
        shield: options.shield || "cursor",
        approved: counters.approved,
        blocked: counters.blocked,
        shadowPass: counters.shadowPass,
        lastEvent,
      };
    },
  };
}

export function formatAmbientTrustHeartbeat(snapshot = {}, options = {}) {
  const last = snapshot.lastEvent;
  const statusPart = last
    ? `${glyphFor(last.status)} ${last.status} / ${last.actionClass} / ${compact(last.title, 42)}`
    : "watching / no decisions yet";
  const reasonPart = last?.reason ? ` / ${compact(last.reason, 56)}` : "";
  return `[${timeStamp(last?.recordedAt || "")}] · ambient trust / ${options.shield || snapshot.shield || "cursor"} / approved ${snapshot.approved || 0} / blocked ${snapshot.blocked || 0} / shadow ${snapshot.shadowPass || 0} / ${statusPart}${reasonPart}`;
}

export function emitDecisionTrace(session, outcome = {}, options = {}) {
  if (!options.verbose && !options.ambientTrust) return;
  console.log(formatDecisionTrace(session, outcome, options));
}
