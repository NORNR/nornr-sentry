import { renderHero, renderSurface } from "./terminal-theme.js";
import { buildArtifactLineage, buildProofQualityScore, buildWhySafeExplanation, readSelectedRecord } from "./record-insights.js";

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

export async function buildProofQualityReport(options = {}) {
  const audience = normalizeText(options.handoffAudience || options.audience || "buyer") || "buyer";
  const { rootDir, record, records } = await readSelectedRecord(options);
  if (!record) {
    return {
      kind: "nornr.sentry.proof_quality.v1",
      rootDir,
      audience,
      record: null,
      quality: null,
      whySafeLines: [],
      lineage: null,
    };
  }
  const quality = buildProofQualityScore(record);
  const whySafeLines = buildWhySafeExplanation(record, { audience });
  const lineage = buildArtifactLineage(records, record);
  return {
    kind: "nornr.sentry.proof_quality.v1",
    rootDir,
    audience,
    record,
    quality,
    whySafeLines,
    lineage,
  };
}

export function renderProofQualityReport(report = {}) {
  if (!report.record) {
    return renderSurface({
      hero: renderHero({
        status: "PROOF LINTER",
        lines: ["No defended record is available yet.", "Run --first-stop first, then lint the resulting proof artifact."],
      }),
      sections: [],
      footer: [],
    });
  }
  const quality = report.quality || {};
  return renderSurface({
    hero: renderHero({
      status: "PROOF LINTER",
      lines: [
        `${quality.overallScore || 0}/100 · ${quality.readiness || "needs_more_context"}`,
        `Audience: ${report.audience}`,
      ],
    }),
    sections: [
      {
        label: "Score",
        lines: [
          `Attribution: ${quality.attributionScore || 0}`,
          `Decision support: ${quality.decisionSupportScore || 0}`,
          `Proof artifact: ${quality.proofScore || 0}`,
          `Overall: ${quality.overallScore || 0}`,
        ],
      },
      {
        label: "Why this is safe",
        lines: report.whySafeLines || [],
      },
      {
        label: "Lint issues",
        lines: (quality.issues || []).length
          ? quality.issues.map((issue) => `${issue.severity}: ${issue.code} · ${issue.note}`)
          : ["No proof-quality issues detected for the current artifact."],
      },
      {
        label: "Artifact lineage",
        lines: [
          `Same-lane records: ${report.lineage?.total || 0}`,
          ...((report.lineage?.recent || []).slice(0, 4).map((entry) => `${entry.generatedAt || "unknown"}: ${entry.status} · ${entry.provider || "local"}${entry.model ? ` / ${entry.model}` : ""}`)),
        ],
      },
    ],
    footer: ["Use proof lint before sharing the artifact outside the immediate operator loop."],
  });
}
