function normalizeOperatorAction(operatorAction = "") {
  const normalized = String(operatorAction ?? "").trim().toLowerCase();
  if (normalized === "approve once" || normalized === "remote approve once") return "approve";
  if (normalized === "tighten mandate") return "tighten";
  return "block";
}

function resolveActivationContext(options = {}) {
  return {
    activationReportUrl: String(options.activationReportUrl ?? "").trim(),
    leadId: String(options.activationLeadId ?? "").trim(),
    email: String(options.activationEmail ?? "").trim().toLowerCase(),
    shareUrl: String(options.activationShareUrl ?? "").trim(),
    provider: String(options.activationProvider ?? options.provider ?? "").trim().toLowerCase(),
    client: String(options.activationClient ?? options.shield ?? "").trim().toLowerCase(),
  };
}

function rewriteActivationRoute(rawUrl = "", nextPath = "") {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed || !String(nextPath ?? "").trim()) return "";
  const isAbsolute = /^[a-z]+:\/\//i.test(trimmed);
  const url = new URL(trimmed, "https://nornr.local");
  url.pathname = url.pathname.replace(/\/api\/public\/sentry-activation$/i, nextPath);
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

function formatLane(value = "") {
  return String(value ?? "").trim().replaceAll("_", " ") || "dangerous";
}

function buildActivationSummary(session = {}, resolution = {}) {
  const lane = formatLane(session?.intent?.actionClass || session?.intent?.lane || session?.intent?.tool || "dangerous");
  const finalStatus = String(resolution?.decision?.finalStatus ?? "").trim();
  if (finalStatus === "approved_once") {
    return `Approved once after review for the ${lane} lane.`;
  }
  if (finalStatus === "tighten_mandate") {
    return `Tightened the mandate after the first live stop on the ${lane} lane.`;
  }
  return `Blocked the ${lane} lane before it became real.`;
}

export function buildActivationReportPayload(session = {}, resolution = {}, options = {}) {
  const recordEnvelope = session?.record?.envelope && typeof session.record.envelope === "object"
    ? session.record.envelope
    : {};
  const context = resolveActivationContext(options);
  return {
    leadId: context.leadId,
    email: context.email,
    shareUrl: context.shareUrl,
    lane: String(session?.intent?.lane ?? "").trim(),
    actionClass: String(session?.intent?.actionClass ?? "").trim(),
    provider: context.provider,
    client: context.client,
    verdict: String(resolution?.decision?.finalStatus ?? "").trim(),
    operatorAction: normalizeOperatorAction(resolution?.operatorAction),
    summary: buildActivationSummary(session, resolution),
    record: {
      kind: "nornr.sentry.activation_result.v1",
      reportedAt: new Date().toISOString(),
      recordPath: String(session?.record?.filePath ?? "").trim(),
      defendedRecord: {
        ...recordEnvelope,
        decision: resolution?.decision && typeof resolution.decision === "object"
          ? resolution.decision
          : recordEnvelope.decision,
        operatorAction: String(resolution?.operatorAction ?? "").trim(),
        statusLine: String(resolution?.statusLine ?? "").trim(),
        mandateSuggestion: resolution?.mandateSuggestion ?? null,
      },
    },
  };
}

export function buildActivationMilestonePayload(options = {}, milestone = {}) {
  const context = resolveActivationContext(options);
  return {
    leadId: context.leadId,
    email: context.email,
    shareUrl: context.shareUrl,
    provider: context.provider,
    client: context.client,
    milestone: String(milestone?.milestone ?? milestone?.kind ?? "records_opened").trim() || "records_opened",
    lane: String(milestone?.lane ?? options?.lane ?? "").trim(),
    actionClass: String(milestone?.actionClass ?? options?.recordsActionClass ?? "").trim(),
    surface: String(milestone?.surface ?? "records_browser").trim() || "records_browser",
    recordsFilter: String(milestone?.recordsFilter ?? options?.recordsFilter ?? "").trim(),
    recordsSort: String(milestone?.recordsSort ?? options?.recordsSort ?? "").trim(),
    recordedAt: new Date().toISOString(),
  };
}

export function resolveActivationMilestoneUrl(options = {}, milestone = {}) {
  const context = resolveActivationContext(options);
  const kind = String(milestone?.milestone ?? milestone?.kind ?? "records_opened").trim().toLowerCase();
  if (kind === "records_opened") {
    return rewriteActivationRoute(context.activationReportUrl, "/api/public/sentry-record-opened");
  }
  return "";
}

export async function reportActivationResult(session = {}, resolution = {}, options = {}) {
  const context = resolveActivationContext(options);
  if (!context.activationReportUrl) {
    return {
      attempted: false,
      reported: false,
      reason: "activation_report_not_configured",
    };
  }

  const payload = buildActivationReportPayload(session, resolution, options);
  try {
    const response = await fetch(context.activationReportUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const bodyText = await response.text();
    return {
      attempted: true,
      reported: response.ok,
      statusCode: response.status,
      bodyText,
      payload,
    };
  } catch (error) {
    return {
      attempted: true,
      reported: false,
      error: String(error?.message || error),
      payload,
    };
  }
}

export async function reportActivationMilestone(options = {}, milestone = {}) {
  const milestoneUrl = resolveActivationMilestoneUrl(options, milestone);
  if (!milestoneUrl) {
    return {
      attempted: false,
      reported: false,
      reason: "activation_milestone_not_configured",
    };
  }

  const payload = buildActivationMilestonePayload(options, milestone);
  try {
    const response = await fetch(milestoneUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const bodyText = await response.text();
    return {
      attempted: true,
      reported: response.ok,
      statusCode: response.status,
      bodyText,
      payload,
    };
  } catch (error) {
    return {
      attempted: true,
      reported: false,
      error: String(error?.message || error),
      payload,
    };
  }
}
