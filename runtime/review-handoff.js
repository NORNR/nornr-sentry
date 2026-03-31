import { renderHero, renderSurface } from "./terminal-theme.js";
import { buildArtifactLineage, buildProofQualityScore, buildWhySafeExplanation, readSelectedRecord, actionClassLabel, effectiveStatus } from "./record-insights.js";

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function audienceLabel(audience = "") {
  const normalized = normalizeText(audience) || "team";
  if (normalized === "buyer") return "Buyer handoff";
  if (normalized === "auditor") return "Auditor handoff";
  return "Team handoff";
}

export async function buildReviewHandoff(options = {}) {
  const audience = normalizeText(options.handoffAudience || "team") || "team";
  const { rootDir, record, records } = await readSelectedRecord(options);
  if (!record) {
    return {
      kind: "nornr.sentry.review_handoff.v1",
      rootDir,
      audience,
      record: null,
      summaryLines: [],
      whySafeLines: [],
      lineage: null,
      quality: null,
    };
  }
  const lineage = buildArtifactLineage(records, record);
  const quality = buildProofQualityScore(record);
  const whySafeLines = buildWhySafeExplanation(record, { audience });
  const summaryLines = [
    `Lane: ${actionClassLabel(record?.intent?.actionClass)}`,
    `Outcome: ${effectiveStatus(record).replace(/_/g, " ")}`,
    `Operator action: ${record?.resolution?.operatorAction || record?.operator?.resolvedAction || "none"}`,
    `Primary reason: ${record?.decision?.primaryReason || "none recorded"}`,
    ...(record?.decisionSupport?.safestAction ? [`Safest next action: ${record.decisionSupport.safestAction}`] : []),
    ...(record?.decisionSupport?.nextCommand ? [`Next command: ${record.decisionSupport.nextCommand}`] : []),
  ];
  return {
    kind: "nornr.sentry.review_handoff.v1",
    rootDir,
    audience,
    record,
    summaryLines,
    whySafeLines,
    lineage,
    quality,
  };
}

export function renderReviewHandoff(report = {}) {
  if (!report.record) {
    return renderSurface({
      hero: renderHero({
        status: "REVIEW HANDOFF",
        lines: ["No defended record is available yet.", "Create one real stop first, then render the handoff surface."],
      }),
      sections: [],
      footer: [],
    });
  }
  return renderSurface({
    hero: renderHero({
      status: "REVIEW HANDOFF",
      lines: [
        `${audienceLabel(report.audience)} · ${actionClassLabel(report.record?.intent?.actionClass)}`,
        `Artifact quality ${report.quality?.overallScore || 0}/100 · ${report.quality?.readiness || "needs_more_context"}`,
      ],
    }),
    sections: [
      {
        label: "Summary",
        lines: report.summaryLines || [],
      },
      {
        label: "Why this is safe",
        lines: report.whySafeLines || [],
      },
      {
        label: "Lineage",
        lines: [
          `Same-lane history: ${report.lineage?.total || 0}`,
          ...((report.lineage?.recent || []).slice(0, 4).map((entry) => `${entry.generatedAt || "unknown"}: ${entry.status} · ${entry.operatorAction || "none"}`)),
        ],
      },
      {
        label: "Next commands",
        lines: [
          `  nornr-sentry --proof-lint`,
          `  nornr-sentry --export-record latest`,
          `  nornr-sentry --records`,
        ],
      },
    ],
    footer: ["Review handoff is shorter than the full export, but richer than a social share summary."],
  });
}
