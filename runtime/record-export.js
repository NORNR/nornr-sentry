import { exportDefendedRecordShare, renderDefendedRecordShareExport } from "../artifacts/write-record.js";
import { resolveRecordRootDir } from "./storage-paths.js";

export async function exportSentryDefendedRecord(options = {}) {
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const result = await exportDefendedRecordShare({
    recordPath: options.exportRecord || "",
    rootDir: resolveRecordRootDir(options),
  });
  return {
    ...result,
    reviewSummaryLines: [
      `Proof id: ${result.sharePack?.recordId || "local"}`,
      `Operator action: ${result.sharePack?.operatorAction || "none"}`,
      `Lane: ${result.sharePack?.intent?.actionClass || "unknown"}`,
      `${result.sharePack?.reason || "No reason recorded."}`,
    ],
    suggestedCommands: [
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
    ],
  };
}

export function buildSentryDefendedRecordExportView(result = {}, explicitColumns = 80) {
  const columns = Number(explicitColumns || 0) || 80;
  const compact = columns < 92;
  return {
    kind: "nornr.sentry.record_export_surface.v1",
    columns,
    density: compact ? "compact" : "standard",
    twoColumn: !compact,
    interactiveEntries: true,
    hero: {
      status: "DEFENDED RECORD",
      lines: [
        `Proof ${result.sharePack?.recordId || "local"} · ${result.sharePack?.verdict || "blocked"}`,
        result.sharePack?.artifactSummary || result.sharePack?.headline || "Share-ready defended record exported locally.",
      ],
    },
    sections: [
      {
        label: "Artifact",
        lines: [
          `Operator action: ${result.sharePack?.operatorAction || "none"}`,
          `Action class: ${result.sharePack?.intent?.actionClass || "unknown"}`,
          `Reason: ${result.sharePack?.reason || ""}`,
        ],
      },
      {
        label: "Paths",
        lines: [
          `Record: ${result.filePath}`,
          `Portable record: ${result.portablePath}`,
          `Share pack: ${result.sharePath}`,
        ],
      },
      {
        label: "Review handoff",
        lines: result.reviewSummaryLines || [],
      },
      {
        label: "Next use",
        entries: result.suggestedCommands || [],
      },
    ],
    footer: compact ? [] : ["A defended record is the portable proof object: replay it, share it, and audit it."],
  };
}

export function renderSentryDefendedRecordExport(result = {}) {
  return renderDefendedRecordShareExport(result);
}
