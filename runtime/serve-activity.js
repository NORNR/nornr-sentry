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

function statusBucket(status = "") {
  const normalized = String(status || "").trim();
  if (normalized === "approved" || normalized === "approved_once") return "cleared";
  if (normalized === "shadow_pass") return "shadow";
  return "blocked";
}

function operatorLabel(operatorAction = "") {
  return compact(operatorAction || "", 28);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sortLaneRows(rows = []) {
  return rows.slice().sort((left, right) => {
    if ((right.total || 0) !== (left.total || 0)) return (right.total || 0) - (left.total || 0);
    const rightTime = new Date(right.lastSeenAt || 0).getTime() || 0;
    const leftTime = new Date(left.lastSeenAt || 0).getTime() || 0;
    return rightTime - leftTime;
  });
}

function withinWindow(event = {}, windowMs = 15 * 60 * 1000) {
  const timestamp = new Date(event.recordedAt || 0).getTime();
  if (!timestamp) return false;
  return (Date.now() - timestamp) <= windowMs;
}

export function createServeActivityTracker(options = {}) {
  const startedAt = new Date().toISOString();
  const counters = {
    total: 0,
    blocked: 0,
    cleared: 0,
    shadow: 0,
  };
  const recentEvents = [];
  const lanes = new Map();
  const listeners = new Set();
  let revision = 0;

  function notify() {
    revision += 1;
    for (const listener of listeners) {
      try {
        listener(revision);
      } catch {
        // Keep serve activity updates best-effort only.
      }
    }
  }

  return {
    note(session = {}, outcome = {}, meta = {}) {
      const status = String(outcome.status || session?.decision?.finalStatus || session?.decision?.status || "unknown").trim() || "unknown";
      const bucket = statusBucket(status);
      const actionClass = String(session?.intent?.actionClass || "unknown").trim() || "unknown";
      const title = compact(session?.intent?.title || actionClass, 60);
      const operatorAction = operatorLabel(outcome.operatorAction || "");
      const recordedAt = new Date().toISOString();
      const event = {
        status,
        bucket,
        actionClass,
        title,
        operatorAction,
        reason: compact(outcome.primaryReason || session?.decision?.primaryReason || "", 88),
        source: String(meta.source || "serve").trim() || "serve",
        durationMs: safeNumber(meta.durationMs, 0),
        recordedAt,
      };

      counters.total += 1;
      counters[bucket] += 1;
      recentEvents.unshift(event);
      if (recentEvents.length > 24) recentEvents.length = 24;

      const currentLane = lanes.get(actionClass) || {
        actionClass,
        total: 0,
        blocked: 0,
        cleared: 0,
        shadow: 0,
        lastSeenAt: "",
        lastStatus: "",
        lastOperatorAction: "",
        lastReason: "",
      };
      currentLane.total += 1;
      currentLane[bucket] += 1;
      currentLane.lastSeenAt = recordedAt;
      currentLane.lastStatus = status;
      currentLane.lastOperatorAction = operatorAction;
      currentLane.lastReason = event.reason;
      lanes.set(actionClass, currentLane);
      notify();
    },
    snapshot() {
      const events15m = recentEvents.filter((event) => withinWindow(event));
      const blocked15m = events15m.filter((event) => event.bucket === "blocked").length;
      const cleared15m = events15m.filter((event) => event.bucket === "cleared").length;
      const shadow15m = events15m.filter((event) => event.bucket === "shadow").length;
      return {
        startedAt,
        revision,
        uptimeSeconds: Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
        totals: {
          ...counters,
        },
        lastEvent: recentEvents[0] || null,
        recentEvents: recentEvents.slice(0, 6),
        topLanes: sortLaneRows(Array.from(lanes.values())).slice(0, 4),
        last15Minutes: {
          total: events15m.length,
          blocked: blocked15m,
          cleared: cleared15m,
          shadow: shadow15m,
        },
        client: String(options.shield || "cursor").trim() || "cursor",
      };
    },
    subscribe(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function buildServeActivitySections(snapshot = {}, { compact = false, shield = "cursor" } = {}) {
  const totals = snapshot.totals || {};
  const windowed = snapshot.last15Minutes || {};
  const last = snapshot.lastEvent;
  const topLane = (snapshot.topLanes || [])[0] || null;
  const blockRate = (windowed.total || 0) > 0
    ? `${Math.round(((windowed.blocked || 0) / Math.max(1, windowed.total || 0)) * 100)}%`
    : "0%";
  const hotLaneEntries = (snapshot.topLanes || []).slice(0, compact ? 2 : 4).map((lane) => {
    const operatorSuffix = lane.lastOperatorAction ? ` / ${lane.lastOperatorAction}` : "";
    return {
      label: `${lane.actionClass} · blocked ${lane.blocked || 0} · cleared ${lane.cleared || 0}`,
      argv: ["--client", shield, "--records", "--records-filter", "all", "--records-sort", "latest", "--records-action-class", lane.actionClass],
      commandLines: [`nornr-sentry --client ${shield} --records --records-action-class ${lane.actionClass}`],
      detailLines: [
        `${lane.total} seen${operatorSuffix}`,
        lane.lastReason || "Open this lane in the real defended records browser.",
      ],
    };
  });
  const timelineLines = (snapshot.recentEvents || []).slice(0, compact ? 3 : 6).map((event) => {
    const operatorSuffix = event.operatorAction ? ` · ${event.operatorAction}` : "";
    const durationSuffix = event.durationMs ? ` · ${event.durationMs}ms` : "";
    return `${timeStamp(event.recordedAt)} · ${event.actionClass} · ${event.status}${operatorSuffix}${durationSuffix}`;
  });

  return [
    {
      label: "Live activity",
      lines: [
        `Requests seen: ${totals.total || 0}`,
        `Last 15 min: ${windowed.total || 0} total · blocked ${windowed.blocked || 0} · cleared ${windowed.cleared || 0} · shadow ${windowed.shadow || 0}`,
        `Blocked ratio: ${blockRate}`,
        last
          ? `Latest lane: ${timeStamp(last.recordedAt)} · ${last.actionClass} · ${last.status}${last.operatorAction ? ` · ${last.operatorAction}` : ""}`
          : "Latest lane: waiting for the first request.",
        ...(!compact && last?.reason ? [`Latest reason: ${last.reason}`] : []),
      ],
    },
    ...(timelineLines.length ? [{
      label: "Recent operator timeline",
      lines: timelineLines,
    }] : []),
    ...(hotLaneEntries.length ? [{
      label: "Hot lanes",
      entries: hotLaneEntries,
    }] : []),
    ...(topLane && !compact ? [{
      label: "Lane drilldown",
      lines: [
        `Top lane: ${topLane.actionClass}`,
        `Last status: ${topLane.lastStatus || "unknown"}${topLane.lastOperatorAction ? ` · ${topLane.lastOperatorAction}` : ""}`,
        `Last reason: ${topLane.lastReason || "No reason recorded yet."}`,
      ],
    }] : []),
  ];
}
