import { listDefendedRecordFiles, readDefendedRecord } from "../artifacts/write-record.js";
import { formatDisplayPath, resolveRecordRootDir } from "./storage-paths.js";
import { pickByDensity, renderHero, renderSurface, terminalDensityFlags } from "./terminal-theme.js";

function effectiveStatus(record = {}) {
  return String(
    record?.resolution?.finalStatus
    || record?.decision?.finalStatus
    || record?.decision?.status
    || "unknown",
  ).trim() || "unknown";
}

function statusLabel(status = "") {
  if (status === "approved_once") return "approved once";
  if (status === "shadow_pass") return "shadow pass";
  if (status === "tighten_mandate") return "tighten mandate";
  return String(status || "unknown").replace(/_/g, " ");
}

function cinematicStatusLabel(status = "") {
  if (status === "blocked") return "BLOCKED";
  if (status === "tighten_mandate") return "TIGHTENED";
  if (status === "approved_once" || status === "approved") return "APPROVED ONCE";
  if (status === "shadow_pass") return "SHADOW PASS";
  return String(statusLabel(status) || "unknown").toUpperCase();
}

function statusTone(status = "") {
  if (status === "blocked") return "critical";
  if (status === "tighten_mandate") return "caution";
  if (status === "approved_once" || status === "approved") return "positive";
  return "neutral";
}

function compact(value = "", maxLength = 78) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function titleCase(value = "") {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionClassLabel(actionClass = "") {
  const normalized = String(actionClass || "unknown").trim() || "unknown";
  const aliases = {
    destructive_shell: "Destructive Shell",
    credential_exfiltration: "Secret Export",
    write_outside_scope: "Write Outside Scope",
    vendor_mutation: "Vendor Change",
    outbound_message: "Outbound Message",
    paid_action: "Paid Action",
    production_mutation: "Production Mutation",
    read_only: "Read-only",
  };
  if (aliases[normalized]) return aliases[normalized];
  return titleCase(normalized.replace(/_/g, " "));
}

function conciseRecordTitle(record = {}) {
  const actionClass = String(record?.intent?.actionClass || "unknown").trim() || "unknown";
  const raw = String(record?.intent?.title || "").replace(/\s+/g, " ").trim();
  const normalized = raw
    .replace(/^attempt to\s+/i, "")
    .replace(/^request to\s+/i, "")
    .replace(/^try to\s+/i, "")
    .trim();
  return compact(normalized || actionClassLabel(actionClass), 42);
}

function operatorActionLabel(action = "") {
  const normalized = String(action || "").replace(/_/g, " ").trim().toLowerCase();
  if (!normalized) return "No action";
  if (normalized === "quit") return "Closed";
  if (normalized === "none") return "No action";
  return titleCase(normalized);
}

function formatRecordedAt(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unknown time";
  return normalized.replace("T", " ").replace(/\.\d+Z$/, "Z").slice(0, 19);
}

function conciseProofReason(reason = "", actionClass = "") {
  const normalized = String(reason || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "No primary reason recorded.";
  const actionLabel = actionClassLabel(actionClass).toLowerCase();
  if (new RegExp(`^Action class "${String(actionClass || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" is blocked in the current mandate\.?$`, "i").test(normalized)) {
    return `${titleCase(actionLabel)} is blocked in the current mandate.`;
  }
  if (new RegExp(`^Action class "${String(actionClass || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" requires explicit review in the current mandate\.?$`, "i").test(normalized)) {
    return `${titleCase(actionLabel)} requires explicit review.`;
  }
  return normalized;
}

function proofStatusLine(record = {}) {
  const status = effectiveStatus(record);
  const actionClass = String(record?.intent?.actionClass || "unknown").trim() || "unknown";
  return `${cinematicStatusLabel(status)} · ${actionClassLabel(actionClass)}`;
}

function recordEntry(record = {}, filePath = "", shield = "cursor") {
  const status = effectiveStatus(record);
  const actionClass = String(record?.intent?.actionClass || "unknown").trim() || "unknown";
  const operatorAction = String(record?.resolution?.operatorAction || record?.operator?.resolvedAction || "").trim();
  const recordedAt = String(record?.generatedAt || "").trim();
  const humanReason = conciseProofReason(record?.decision?.primaryReason || "", actionClass);
  const primaryReason = compact(humanReason, 120);
  const title = conciseRecordTitle(record);
  return {
    label: title,
    selectionKey: filePath || `${recordedAt}:${title}`,
    argv: ["--client", shield, "--export-record", filePath],
    commandLines: [proofStatusLine(record)],
    detailLines: [
      `Captured ${formatRecordedAt(recordedAt)} · Operator ${operatorActionLabel(operatorAction)}`,
      primaryReason,
    ],
    compactDetailLines: [
      `Captured ${formatRecordedAt(recordedAt)} · ${operatorActionLabel(operatorAction)}`,
    ],
    meta: {
      kind: "record",
      filePath,
      status,
      actionClass,
      recordedAt,
      title,
      operatorAction,
      primaryReason,
      statusLine: proofStatusLine(record),
      tone: statusTone(status),
    },
  };
}

function sortEntries(entries = [], sort = "latest") {
  const normalizedSort = String(sort || "latest").trim().toLowerCase() || "latest";
  const items = entries.slice();
  if (normalizedSort === "action") {
    return items.sort((left, right) => String(left.meta?.actionClass || "").localeCompare(String(right.meta?.actionClass || "")));
  }
  if (normalizedSort === "status") {
    return items.sort((left, right) => String(left.meta?.status || "").localeCompare(String(right.meta?.status || "")));
  }
  return items.sort((left, right) => String(right.meta?.recordedAt || "").localeCompare(String(left.meta?.recordedAt || "")));
}

function filterEntry(shield = "cursor", filter = "all", currentSort = "latest", limit = 12, actionClass = "") {
  const argv = ["--client", shield, "--records", "--records-filter", filter, "--records-sort", currentSort, "--records-limit", String(limit)];
  if (actionClass) argv.push("--records-action-class", actionClass);
  const details = {
    all: "Full proof queue across every lane.",
    blocked: "Only blocked or tightened records.",
    approved: "Only approved-once records.",
    shadow: "Only shadow-pass records.",
  };
  return {
    label: filter === "all" ? "All" : filter === "blocked" ? "Blocked" : filter === "approved" ? "Approved" : "Shadow",
    argv,
    detailLines: [details[filter] || "Refresh the browser with this proof filter."],
  };
}

function sortEntry(shield = "cursor", currentFilter = "all", sort = "latest", limit = 12, actionClass = "") {
  const argv = ["--client", shield, "--records", "--records-filter", currentFilter, "--records-sort", sort, "--records-limit", String(limit)];
  if (actionClass) argv.push("--records-action-class", actionClass);
  const details = {
    latest: "Newest records first.",
    action: "Group by lane.",
    status: "Group by outcome.",
  };
  return {
    label: sort === "latest" ? "Latest" : sort === "action" ? "By lane" : "By outcome",
    argv,
    detailLines: [details[sort] || "Refresh the browser with this proof sort order."],
  };
}

function emptyRecordActionEntries(shield = "cursor") {
  return [
    {
      label: "Run demo stop",
      argv: ["--client", shield, "--demo", "destructive_shell"],
      detailLines: ["Create one real stop locally, then come back here for the defended record."],
    },
    {
      label: "Replay attacks",
      argv: ["--client", shield, "--policy-replay"],
      detailLines: ["Open the synthetic attack chooser if you want to stress the mandate first."],
    },
    {
      label: "Open proof hub",
      argv: ["--client", shield, "--proof-hub"],
      detailLines: ["See where real defended records fit beside replay and export flows."],
    },
  ];
}

function matchesFilter(status = "", filter = "all") {
  const normalizedFilter = String(filter || "all").trim().toLowerCase();
  if (normalizedFilter === "all") return true;
  if (normalizedFilter === "blocked") return status === "blocked" || status === "tighten_mandate";
  if (normalizedFilter === "approved") return status === "approved" || status === "approved_once";
  if (normalizedFilter === "shadow") return status === "shadow_pass";
  return true;
}

export async function buildRecordsBrowser(options = {}) {
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const rootDir = resolveRecordRootDir(options);
  const files = await listDefendedRecordFiles(rootDir);
  const limit = Math.max(1, Number(options.recordsLimit || 12) || 12);
  const selectedFiles = files.slice(-limit).reverse();
  const records = [];
  for (const filePath of selectedFiles) {
    try {
      const record = await readDefendedRecord(filePath);
      records.push({ filePath, record });
    } catch {
      // Keep browser resilient if one local record is malformed.
    }
  }

  const counts = {
    total: files.length,
    loaded: records.length,
    blocked: records.filter(({ record }) => {
      const status = effectiveStatus(record);
      return status === "blocked" || status === "tighten_mandate";
    }).length,
    approved: records.filter(({ record }) => effectiveStatus(record) === "approved" || effectiveStatus(record) === "approved_once").length,
    shadow: records.filter(({ record }) => effectiveStatus(record) === "shadow_pass").length,
  };
  const activeFilter = String(options.recordsFilter || "all").trim().toLowerCase() || "all";
  const activeActionClass = String(options.recordsActionClass || "").trim();
  const activeSort = String(options.recordsSort || "latest").trim().toLowerCase() || "latest";
  const filteredRecords = records.filter(({ record }) => {
    const status = effectiveStatus(record);
    const actionClass = String(record?.intent?.actionClass || "").trim();
    return matchesFilter(status, activeFilter) && (!activeActionClass || actionClass === activeActionClass);
  });

  return {
    kind: "nornr.sentry.records_browser.v1",
    generatedAt: new Date().toISOString(),
    shield,
    rootDir,
    counts,
    activeFilter,
    activeActionClass,
    activeSort,
    recordsLimit: limit,
    filterEntries: [
      filterEntry(shield, "all", activeSort, limit, activeActionClass),
      filterEntry(shield, "blocked", activeSort, limit, activeActionClass),
      filterEntry(shield, "approved", activeSort, limit, activeActionClass),
      filterEntry(shield, "shadow", activeSort, limit, activeActionClass),
    ],
    laneEntries: Array.from(new Set(records.map(({ record }) => String(record?.intent?.actionClass || "").trim()).filter(Boolean))).slice(0, 6).map((actionClass) => ({
      label: activeActionClass === actionClass ? `${actionClassLabel(actionClass)} · active` : actionClassLabel(actionClass),
      argv: ["--client", shield, "--records", "--records-filter", activeFilter, "--records-sort", activeSort, "--records-limit", String(limit), "--records-action-class", actionClass],
      detailLines: ["Focus one lane."],
    })),
    sortEntries: [
      sortEntry(shield, activeFilter, "latest", limit, activeActionClass),
      sortEntry(shield, activeFilter, "action", limit, activeActionClass),
      sortEntry(shield, activeFilter, "status", limit, activeActionClass),
    ],
    browserActions: records.length
      ? [
        {
          label: "Open proof hub",
          argv: ["--client", shield, "--proof-hub"],
          detailLines: ["Compare real records, local replay, and synthetic replay."],
        },
        {
          label: "Replay local records",
          argv: ["--client", shield, "--record-replay"],
          detailLines: ["Re-evaluate the local proof queue under the current mandate."],
        },
      ]
      : emptyRecordActionEntries(shield),
    entries: sortEntries(filteredRecords.map(({ filePath, record }) => recordEntry(record, filePath, shield)), activeSort),
  };
}

function buildSelectedRecordActions(browser = {}, selectedEntry = null) {
  const selectedMeta = selectedEntry?.meta || {};
  if (selectedMeta.kind !== "record" || !selectedMeta.filePath) return [];
  const shield = String(browser.shield || "cursor").trim() || "cursor";
  const actionClass = String(selectedMeta.actionClass || "").trim();
  const baseActionLabel = selectedEntry?.label || "Selected record";
  return [
    {
      label: "Open record",
      argv: ["--client", shield, "--export-record", selectedMeta.filePath],
      detailLines: ["Open the defended record export surface for this proof object."],
    },
    {
      label: actionClass ? `Focus ${actionClassLabel(actionClass)}` : "Focus lane",
      argv: actionClass
        ? ["--client", shield, "--records", "--records-filter", browser.activeFilter || "all", "--records-sort", browser.activeSort || "latest", "--records-limit", String(browser.recordsLimit || 12), "--records-action-class", actionClass]
        : ["--client", shield, "--records"],
      detailLines: ["Stay in records, but narrow the lane around this proof object."],
    },
    {
      label: "Replay local",
      argv: ["--client", shield, "--record-replay"],
      detailLines: ["Compare the current mandate against the local proof history."],
    },
    {
      label: "Proof hub",
      argv: ["--client", shield, "--proof-hub"],
      detailLines: ["Jump to the real-vs-synthetic proof chooser."],
    },
  ];
}

function buildSelectedRecordSummary(selectedEntry = null) {
  const selectedMeta = selectedEntry?.meta || {};
  if (selectedMeta.kind !== "record" || !selectedMeta.filePath) return null;
  return {
    label: "Selected proof",
    tone: selectedMeta.tone || "neutral",
    lines: [
      selectedMeta.statusLine || "DEFENDED RECORD",
      selectedEntry?.label || selectedMeta.title || "Selected defended record",
      `Saved · ${formatRecordedAt(selectedMeta.recordedAt)} · ${operatorActionLabel(selectedMeta.operatorAction)}`,
      `Why: ${selectedMeta.primaryReason || "No primary reason recorded."}`,
    ],
  };
}

export function buildRecordsBrowserView(browser = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const hasAnyRecords = Number(browser.counts?.loaded || browser.counts?.total || 0) > 0;
  const hasVisibleRecords = Boolean((browser.entries || []).length);
  const queueScopeLine = browser.counts?.total > browser.counts?.loaded
    ? `Loaded ${browser.counts?.loaded || 0} most recent of ${browser.counts?.total || 0} local records`
    : `Local records ${browser.counts?.loaded || 0}`;
  return {
    kind: "nornr.sentry.records_browser_surface.v1",
    columns,
    density,
    twoColumn: columns >= 100,
    interactiveEntries: true,
    initialSelectionSectionLabel: hasVisibleRecords ? "Proof queue" : hasAnyRecords ? "Browser lens" : "Start here",
    hero: {
      status: "DEFENDED RECORDS",
      lines: hasAnyRecords
        ? [
          `${queueScopeLine} · Filter ${browser.activeFilter || "all"}${browser.activeActionClass ? ` · Lane ${actionClassLabel(browser.activeActionClass)}` : ""} · Sort ${browser.activeSort || "latest"}`,
          pickByDensity({
            compact: "Browse real proof objects and open one record.",
            standard: "Browse real proof objects and open one defended record at a time.",
            wide: "Browse real proof objects, inspect the queue, and open one defended record at a time for replay, review, or sharing.",
          }, density),
        ]
        : [
          "No local defended records yet.",
          pickByDensity({
            compact: "Create one stop, then come back here.",
            standard: "Create one blocked, tightened, or approved-once stop, then come back here.",
            wide: "This console is for real local proof objects after the first stop, not before the first stop exists.",
          }, density),
        ],
    },
    buildSelectionActions: (selectedEntry) => buildSelectedRecordActions(browser, selectedEntry),
    buildSelectionSummary: (selectedEntry) => buildSelectedRecordSummary(selectedEntry),
    sections: hasAnyRecords
      ? [
        {
          label: "Proof queue",
          compactEntries: true,
          ...(hasVisibleRecords
            ? { entries: browser.entries || [] }
            : {
              lines: [
                "No records match the current filter lens.",
                "Change filter, sort, or focused lane to reopen the proof queue.",
              ],
            }),
        },
        {
          label: "Browser lens",
          compactEntries: true,
          entries: [
            ...(browser.filterEntries || []),
            ...(browser.sortEntries || []),
            ...(browser.laneEntries || []),
          ],
        },
        {
          label: "Next proof step",
          compactEntries: true,
          entries: browser.browserActions || [],
        },
        {
          label: "Proof posture",
          lines: [
            `Queue ${browser.counts?.loaded || 0}${browser.counts?.total > browser.counts?.loaded ? ` of ${browser.counts?.total || 0}` : ""}`,
            `Blocked ${browser.counts?.blocked || 0} · Approved ${browser.counts?.approved || 0} · Shadow ${browser.counts?.shadow || 0}`,
            browser.activeActionClass
              ? `Lane ${actionClassLabel(browser.activeActionClass)}`
              : "Lane all",
            compact
              ? "Real proof queue. Enter opens record."
              : "Real proof queue, not synthetic replay. Enter opens record.",
          ],
        },
      ]
      : [
        {
          label: "Start here",
          entries: browser.browserActions || [],
        },
        {
          label: "No local records yet",
          lines: [
            `Record root: ${formatDisplayPath(browser.rootDir, browser)}`,
            "Trigger one real stop locally, then reopen this console.",
            "Blocked, tighten-mandate, and approved-once outcomes all show up here as defended records.",
          ],
        },
        {
          label: "What this console is for",
          lines: [
            "This surface is for real local defended records only.",
            "Replay attacks are synthetic scenarios. They are useful, but they are not proof objects.",
            "After the first stop, this is where you open, replay, and export the real artifact.",
          ],
        },
      ],
    footer: compact ? [] : [`Record root: ${formatDisplayPath(browser.rootDir, browser)}`, "Real proof queue, not synthetic replay."],
  };
}

export function renderRecordsBrowser(browser = {}) {
  const view = buildRecordsBrowserView(browser);
  return renderSurface({
    hero: renderHero(view.hero),
    sections: (view.sections || []).map((section) => ({
      label: section.label,
      lines: section.lines || (section.entries || []).flatMap((entry, index) => ([
        ...(index ? [""] : []),
        entry.label || "",
        ...((entry.commandLines || []).map((line) => `  ${line}`)),
        ...((entry.detailLines || []).map((line) => `  ${line}`)),
      ].filter(Boolean))),
    })),
    footer: view.footer,
  });
}
