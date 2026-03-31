import { renderHero, renderSurface } from "./terminal-theme.js";
import { buildProofQualityScore, effectiveStatus, readSentryRecordEnvelopes } from "./record-insights.js";

function pct(part = 0, total = 0) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export async function buildOperatorScorecard(options = {}) {
  const { rootDir, records } = await readSentryRecordEnvelopes(options);
  const total = records.length;
  const counts = {
    blocked: 0,
    approved_once: 0,
    tighten_mandate: 0,
    approved: 0,
    buyerReady: 0,
  };
  for (const record of records) {
    const status = effectiveStatus(record);
    counts[status] = (counts[status] || 0) + 1;
    const quality = buildProofQualityScore(record);
    if (quality.readiness === "buyer_ready") counts.buyerReady += 1;
  }
  return {
    kind: "nornr.sentry.operator_scorecard.v1",
    rootDir,
    total,
    counts,
    ratios: {
      blockedRate: pct(counts.blocked, total),
      approveOnceRate: pct(counts.approved_once, total),
      tightenRate: pct(counts.tighten_mandate, total),
      buyerReadyRate: pct(counts.buyerReady, total),
    },
  };
}

export function renderOperatorScorecard(scorecard = {}) {
  return renderSurface({
    hero: renderHero({
      status: "OPERATOR SCORECARD",
      lines: [
        `${scorecard.total || 0} defended records`,
        `Buyer-ready artifacts: ${scorecard.ratios?.buyerReadyRate || "0%"}`,
      ],
    }),
    sections: [
      {
        label: "Decision mix",
        lines: [
          `Blocked: ${scorecard.counts?.blocked || 0} · ${scorecard.ratios?.blockedRate || "0%"}`,
          `Approved once: ${scorecard.counts?.approved_once || 0} · ${scorecard.ratios?.approveOnceRate || "0%"}`,
          `Tighten mandate: ${scorecard.counts?.tighten_mandate || 0} · ${scorecard.ratios?.tightenRate || "0%"}`,
          `Approved: ${scorecard.counts?.approved || 0}`,
        ],
      },
      {
        label: "Proof quality",
        lines: [
          `Buyer-ready artifacts: ${scorecard.counts?.buyerReady || 0}`,
          `Artifact readiness rate: ${scorecard.ratios?.buyerReadyRate || "0%"}`,
        ],
      },
      {
        label: "Next commands",
        lines: [
          `  nornr-sentry --trust-advisor`,
          `  nornr-sentry --proof-lint`,
          `  nornr-sentry --records`,
        ],
      },
    ],
    footer: ["Use the scorecard to see whether your local boundary is teaching the operator to block, tighten, or overuse approve once."],
  });
}
