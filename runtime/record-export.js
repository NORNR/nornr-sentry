import { exportDefendedRecordShare } from "../artifacts/write-record.js";
import { buildShareCopyEntries, buildShareVariants } from "./share-proof.js";
import { formatDisplayPath, resolveRecordRootDir } from "./storage-paths.js";
import { renderHero, renderSurface } from "./terminal-theme.js";

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
  return aliases[normalized] || titleCase(normalized.replace(/_/g, " "));
}

export async function exportSentryDefendedRecord(options = {}) {
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const result = await exportDefendedRecordShare({
    recordPath: options.exportRecord || "",
    rootDir: resolveRecordRootDir(options),
  });
  const lane = actionClassLabel(result.sharePack?.intent?.actionClass || "unknown");
  const verdict = String(result.sharePack?.verdict || "blocked").replace(/_/g, " ").trim() || "blocked";
  const headline = result.sharePack?.headline || result.sharePack?.artifactSummary || `Blocked ${lane}`;
  const reason = result.sharePack?.reason || "No reason recorded.";
  const shareVariants = buildShareVariants(result);
  const shareSafeLines = (shareVariants.summary || "").split("\n").filter(Boolean);
  return {
    ...result,
    screenshotMode: Boolean(options.screenshotMode),
    shareVariants,
    shareSafeLines,
    shareSafeText: shareVariants.summary || shareSafeLines.join("\n"),
    storyLines: [
      `Stopped: ${headline}`,
      `Why it mattered: ${reason}`,
      `Artifact: defended record, portable export, and share pack are now attached to this lane.`,
      `Next: open the proof queue or copy a public-safe summary.`,
    ],
    reviewSummaryLines: [
      `Proof id: ${result.sharePack?.recordId || "local"}`,
      `Operator action: ${result.sharePack?.operatorAction || "none"}`,
      `Lane: ${lane}`,
      `${reason}`,
    ],
    shareCopyEntries: buildShareCopyEntries(result, shield),
    suggestedCommands: [
      {
        label: "Browse defended records",
        argv: ["--client", shield, "--records"],
        commandLines: [`nornr-sentry --client ${shield} --records`],
        detailLines: ["Open the local browser of real defended records."],
      },
      {
        label: "Open proof hub",
        argv: ["--client", shield, "--proof-hub"],
        commandLines: [`nornr-sentry --client ${shield} --proof-hub`],
        detailLines: ["Open the compare/replay hub for real proof vs synthetic replay."],
      },
      {
        label: "Replay local records",
        argv: ["--client", shield, "--record-replay"],
        commandLines: [`nornr-sentry --client ${shield} --record-replay`],
        detailLines: ["Replay real defended records against the current local mandate."],
      },
      {
        label: "View local summary",
        argv: ["--client", shield, "--summary"],
        commandLines: [`nornr-sentry --client ${shield} --summary`],
        detailLines: ["See the local posture and latest defended record signals."],
      },
      {
        label: "Replay attacks",
        argv: ["--client", shield, "--policy-replay"],
        commandLines: [`nornr-sentry --client ${shield} --policy-replay`],
        detailLines: ["Compare the artifact-backed local posture to the attack replay surface."],
      },
      {
        label: "Run first stop again",
        argv: ["--client", shield, "--first-stop"],
        commandLines: [`nornr-sentry --client ${shield} --first-stop`],
        detailLines: ["Re-run the shortest wedge-to-proof path if you want a stronger public proof pass."],
      },
    ],
  };
}

export function buildSentryDefendedRecordExportView(result = {}, explicitColumns = 80) {
  const columns = Number(explicitColumns || 0) || 80;
  const compact = columns < 92;
  const screenshotMode = Boolean(result.screenshotMode);
  return {
    kind: "nornr.sentry.record_export_surface.v1",
    columns,
    density: compact ? "compact" : "standard",
    twoColumn: columns >= 100,
    interactiveEntries: true,
    selectionFocused: columns >= 100,
    initialSelectionSectionLabel: "Share copy",
    buildSelectionSummary: (selectedEntry) => selectedEntry
      ? {
        label: "Selected share path",
        tone: "neutral",
        lines: [
          selectedEntry.label || "Selected share path",
          selectedEntry.detailLines?.[0] || "",
          selectedEntry.commandLines?.[0] || "",
        ].filter(Boolean),
      }
      : null,
    hero: {
      status: screenshotMode ? "SHARE-SAFE PROOF" : "DEFENDED RECORD EXPORT",
      lines: [
        `Proof ${result.sharePack?.recordId || "local"} · ${result.sharePack?.verdict || "blocked"}`,
        result.sharePack?.artifactSummary || result.sharePack?.headline || "Share-ready defended record exported locally.",
      ],
    },
    sections: [
      {
        label: "What just happened",
        lines: result.storyLines || [],
      },
      {
        label: "Artifact",
        lines: [
          `Operator action: ${result.sharePack?.operatorAction || "none"}`,
          `Lane: ${actionClassLabel(result.sharePack?.intent?.actionClass || "unknown")}`,
          `Verdict: ${titleCase(String(result.sharePack?.verdict || "blocked").replace(/_/g, " "))}`,
        ],
      },
      {
        label: "Share-safe summary",
        lines: result.shareSafeLines || [],
      },
      {
        label: "Share copy",
        entries: result.shareCopyEntries || [],
      },
      ...(!screenshotMode ? [{
        label: "Paths",
        lines: [
          `Record: ${formatDisplayPath(result.filePath, result)}`,
          `Portable record: ${formatDisplayPath(result.portablePath, result)}`,
          `Share pack: ${formatDisplayPath(result.sharePath, result)}`,
        ],
      }] : []),
      {
        label: "Review handoff",
        lines: result.reviewSummaryLines || [],
      },
      {
        label: "Next step",
        entries: result.suggestedCommands || [],
      },
    ],
    footer: compact
      ? []
      : [screenshotMode ? "Screenshot mode hides raw local paths and keeps the proof public-safe first." : "A defended record is the portable proof object: replay it, share it, and audit it."],
  };
}

export function renderSentryDefendedRecordExport(result = {}) {
  const view = buildSentryDefendedRecordExportView(result);
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
