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

function compact(value = "", maxLength = 78) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function recordEntry(record = {}, filePath = "", shield = "cursor") {
  const status = effectiveStatus(record);
  const actionClass = String(record?.intent?.actionClass || "unknown").trim() || "unknown";
  const operatorAction = String(record?.resolution?.operatorAction || record?.operator?.resolvedAction || "").trim();
  const recordedAt = String(record?.generatedAt || "").trim();
  return {
    label: `${actionClass} · ${statusLabel(status)}`,
    argv: ["--client", shield, "--export-record", filePath],
    commandLines: [recordedAt ? recordedAt.replace("T", " ").slice(0, 19) : filePath],
    detailLines: [
      operatorAction ? `Operator action: ${operatorAction}` : "Operator action: none",
      compact(record?.decision?.primaryReason || "No primary reason recorded."),
    ],
    meta: {
      kind: "record",
      filePath,
      status,
      actionClass,
      recordedAt,
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
  const command = [`nornr-sentry --client ${shield} --records --records-filter ${filter} --records-sort ${currentSort}`];
  if (actionClass) command.push(`--records-action-class ${actionClass}`);
  return {
    label: filter === "all" ? "Show all" : `Show ${filter}`,
    argv,
    commandLines: [command.join(" ")],
    detailLines: ["Refresh the browser with this record filter."],
  };
}

function sortEntry(shield = "cursor", currentFilter = "all", sort = "latest", limit = 12, actionClass = "") {
  const argv = ["--client", shield, "--records", "--records-filter", currentFilter, "--records-sort", sort, "--records-limit", String(limit)];
  if (actionClass) argv.push("--records-action-class", actionClass);
  const command = [`nornr-sentry --client ${shield} --records --records-filter ${currentFilter} --records-sort ${sort}`];
  if (actionClass) command.push(`--records-action-class ${actionClass}`);
  return {
    label: sort === "latest" ? "Sort latest first" : sort === "action" ? "Sort by action class" : "Sort by status",
    argv,
    commandLines: [command.join(" ")],
    detailLines: ["Refresh the browser with this record sort order."],
  };
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
    total: records.length,
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
      label: activeActionClass === actionClass ? `Lane ${actionClass} (active)` : `Lane ${actionClass}`,
      argv: ["--client", shield, "--records", "--records-filter", activeFilter, "--records-sort", activeSort, "--records-limit", String(limit), "--records-action-class", actionClass],
      commandLines: [`nornr-sentry --client ${shield} --records --records-filter ${activeFilter} --records-sort ${activeSort} --records-action-class ${actionClass}`],
      detailLines: ["Focus the browser on one action class lane."],
    })),
    sortEntries: [
      sortEntry(shield, activeFilter, "latest", limit, activeActionClass),
      sortEntry(shield, activeFilter, "action", limit, activeActionClass),
      sortEntry(shield, activeFilter, "status", limit, activeActionClass),
    ],
    browserActions: [
      {
        label: "Open proof hub",
        argv: ["--client", shield, "--proof-hub"],
        commandLines: [`nornr-sentry --client ${shield} --proof-hub`],
        detailLines: ["Compare real defended records, local replay, and synthetic replay."],
      },
      {
        label: "Replay local records",
        argv: ["--client", shield, "--record-replay"],
        commandLines: [`nornr-sentry --client ${shield} --record-replay`],
        detailLines: ["Re-evaluate the local proof objects under the current mandate."],
      },
    ],
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
      label: `Open ${baseActionLabel}`,
      argv: ["--client", shield, "--export-record", selectedMeta.filePath],
      commandLines: [`nornr-sentry --client ${shield} --export-record ${selectedMeta.filePath}`],
      detailLines: ["Open the defended record export surface for this proof object."],
    },
    {
      label: actionClass ? `Focus lane ${actionClass}` : "Focus lane",
      argv: actionClass
        ? ["--client", shield, "--records", "--records-filter", browser.activeFilter || "all", "--records-sort", browser.activeSort || "latest", "--records-limit", String(browser.recordsLimit || 12), "--records-action-class", actionClass]
        : ["--client", shield, "--records"],
      commandLines: actionClass
        ? [`nornr-sentry --client ${shield} --records --records-filter ${browser.activeFilter || "all"} --records-sort ${browser.activeSort || "latest"} --records-action-class ${actionClass}`]
        : [`nornr-sentry --client ${shield} --records`],
      detailLines: ["Stay in the real records browser, but narrow the lane around this proof object."],
    },
    {
      label: "Replay local records",
      argv: ["--client", shield, "--record-replay"],
      commandLines: [`nornr-sentry --client ${shield} --record-replay`],
      detailLines: ["Compare the current mandate against the full local proof history."],
    },
    {
      label: "Open proof hub",
      argv: ["--client", shield, "--proof-hub"],
      commandLines: [`nornr-sentry --client ${shield} --proof-hub`],
      detailLines: ["Jump to the real-vs-synthetic proof chooser from this record."],
    },
  ];
}

export function buildRecordsBrowserView(browser = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.records_browser_surface.v1",
    columns,
    density,
    twoColumn: !compact && columns >= 108,
    interactiveEntries: true,
    initialSelectionSectionLabel: (browser.entries || []).length ? "Recent defended records" : "Filters",
    hero: {
      status: "DEFENDED RECORDS",
      lines: [
        `Local records ${browser.counts?.total || 0} · Filter ${browser.activeFilter || "all"}${browser.activeActionClass ? ` · Lane ${browser.activeActionClass}` : ""} · Sort ${browser.activeSort || "latest"}`,
        pickByDensity({
          compact: "Browse real defended records and open one proof object.",
          standard: "Browse real defended records and open one proof object at a time.",
          wide: "Browse real defended records, then open one proof object at a time for replay, review, or sharing.",
        }, density),
      ],
    },
    buildSelectionActions: (selectedEntry) => buildSelectedRecordActions(browser, selectedEntry),
    sections: [
      {
        label: "Filters",
        entries: browser.filterEntries || [],
      },
      {
        label: "Sort",
        entries: browser.sortEntries || [],
      },
      ...(browser.laneEntries?.length ? [{
        label: "Lanes",
        entries: browser.laneEntries,
      }] : []),
      {
        label: "Record actions",
        entries: browser.browserActions || [],
      },
      {
        label: "Recent defended records",
        entries: browser.entries || [],
      },
      {
        label: "What these are",
        lines: [
          `Blocked or tightened: ${browser.counts?.blocked || 0}`,
          `Approved: ${browser.counts?.approved || 0}`,
          `Shadow pass: ${browser.counts?.shadow || 0}`,
          `Showing: ${(browser.entries || []).length} of ${browser.counts?.total || 0}`,
          compact
            ? "Enter opens the selected defended record."
            : "These are real defended records from the local boundary, not replay attacks. Enter opens the selected defended record.",
        ],
      },
    ],
    footer: compact ? [] : [`Record root: ${formatDisplayPath(browser.rootDir, browser)}`, "Use this browser when you want the real proof object, not the synthetic attack replay."],
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
