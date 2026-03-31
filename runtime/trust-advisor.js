import { evaluateIntent } from "../decisions/evaluate.js";
import {
  buildDefaultMandate,
  defaultProtectPresetForShield,
  supportedTrustModes,
  trustModeLabel,
} from "../mandates/defaults.js";
import { renderHero, renderSurface } from "./terminal-theme.js";
import { buildDecisionSupport } from "./decision-support.js";
import {
  effectiveStatus,
  laneFamilyForActionClass,
  readSentryRecordEnvelopes,
} from "./record-insights.js";

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function scoreMode(record = {}, scores = {}) {
  const actionClass = normalizeText(record?.intent?.actionClass);
  const status = effectiveStatus(record);
  const intervention = ["blocked", "approved_once", "tighten_mandate"].includes(status);
  if (!intervention) return scores;
  const next = { ...scores };
  if (actionClass === "paid_action") next["finance-guarded"] += 4;
  if (actionClass === "vendor_mutation") {
    next["finance-guarded"] += 1;
    next["prod-locked"] += 2;
  }
  if (actionClass === "outbound_message") next["outbound-guarded"] += 4;
  if (actionClass === "credential_exfiltration") {
    next["outbound-guarded"] += 3;
    next.strict += 2;
  }
  if (["destructive_shell", "write_outside_scope"].includes(actionClass)) next["repo-safe"] += 4;
  if (actionClass === "production_mutation") {
    next["prod-locked"] += 4;
    next.strict += 2;
  }
  if (["approved_once", "tighten_mandate"].includes(status)) next["observe-first"] += 2;
  if (status === "blocked") next.strict += 1;
  return next;
}

function buildModeScores(records = []) {
  const scores = Object.fromEntries(supportedTrustModes().map((mode) => [mode, mode === "standard" ? 1 : 0]));
  for (const record of records) Object.assign(scores, scoreMode(record, scores));
  return scores;
}

function pickRecommendation(scores = {}) {
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const [winnerMode, winnerScore] = ranked[0] || ["standard", 0];
  const [, runnerScore] = ranked[1] || ["standard", 0];
  const confidence = winnerScore >= 8 ? "high" : winnerScore >= 4 ? "medium" : "low";
  const note = winnerScore <= 1
    ? "Not enough lane evidence exists yet, so standard trust remains the safest default."
    : `${trustModeLabel(winnerMode)} currently matches the strongest repeated intervention pattern.`;
  return {
    winnerMode,
    winnerLabel: trustModeLabel(winnerMode),
    winnerScore,
    runnerScore,
    confidence,
    note,
    ranked: ranked.map(([mode, score]) => ({ mode, label: trustModeLabel(mode), score })),
  };
}

function buildRolloutDiff(records = [], options = {}, candidateMode = "standard") {
  const shield = normalizeText(options.shield || records[0]?.client?.shield || "cursor") || "cursor";
  const protectPreset = normalizeText(options.protectPreset || records[0]?.mandate?.preset || defaultProtectPresetForShield(shield)) || defaultProtectPresetForShield(shield);
  const currentMode = normalizeText(options.trustMode || records[0]?.mandate?.trustMode || "standard") || "standard";
  const currentMandate = buildDefaultMandate(shield, { ...options, protectPreset, trustMode: currentMode });
  const candidateMandate = buildDefaultMandate(shield, { ...options, protectPreset, trustMode: candidateMode });
  const recent = records.slice(-12);
  const changed = recent.map((record) => {
    const currentDecision = evaluateIntent(record.intent, currentMandate);
    const candidateDecision = evaluateIntent(record.intent, candidateMandate);
    const currentSupport = buildDecisionSupport(record.intent, currentDecision, currentMandate, {}, options);
    const candidateSupport = buildDecisionSupport(record.intent, candidateDecision, candidateMandate, {}, options);
    return {
      actionClass: record.intent?.actionClass,
      currentStatus: currentDecision.status,
      candidateStatus: candidateDecision.status,
      changed: currentDecision.status !== candidateDecision.status,
      currentSafestAction: currentSupport.safestAction,
      candidateSafestAction: candidateSupport.safestAction,
    };
  });
  return {
    currentMode,
    currentLabel: trustModeLabel(currentMode),
    candidateMode,
    candidateLabel: trustModeLabel(candidateMode),
    changedCount: changed.filter((entry) => entry.changed).length,
    rows: changed,
  };
}

export async function buildTrustAdvisor(options = {}) {
  const { rootDir, records } = await readSentryRecordEnvelopes(options);
  const scores = buildModeScores(records);
  const recommendation = pickRecommendation(scores);
  const rollout = buildRolloutDiff(records, options, normalizeText(options.trustMode || recommendation.winnerMode) || recommendation.winnerMode);
  const familyMix = Object.entries(records.reduce((acc, record) => {
    const family = laneFamilyForActionClass(record?.intent?.actionClass);
    acc[family] = (acc[family] || 0) + 1;
    return acc;
  }, {})).sort((left, right) => right[1] - left[1]);
  return {
    kind: "nornr.sentry.trust_advisor.v1",
    rootDir,
    records,
    recommendation,
    rollout,
    familyMix,
  };
}

export function renderTrustAdvisor(report = {}) {
  return renderSurface({
    hero: renderHero({
      status: "TRUST ADVISOR",
      lines: [
        `${report.recommendation?.winnerLabel || "Standard trust"} · ${report.recommendation?.confidence || "low"} confidence`,
        report.recommendation?.note || "Use local records to choose the next trust posture.",
      ],
    }),
    sections: [
      {
        label: "Recommendation",
        lines: [
          `Suggested mode: ${report.recommendation?.winnerLabel || "Standard trust"}`,
          `Score gap: ${report.recommendation?.winnerScore || 0} vs ${report.recommendation?.runnerScore || 0}`,
          `Confidence: ${report.recommendation?.confidence || "low"}`,
        ],
      },
      {
        label: "Mode leaderboard",
        lines: (report.recommendation?.ranked || []).slice(0, 5).map((entry) => `${entry.label}: ${entry.score}`),
      },
      {
        label: "Lane family mix",
        lines: (report.familyMix || []).map(([family, count]) => `${family}: ${count}`),
      },
      {
        label: "Rollout assistant",
        lines: [
          `Current mode: ${report.rollout?.currentLabel || "Standard trust"}`,
          `Candidate mode: ${report.rollout?.candidateLabel || "Standard trust"}`,
          `Recent records that would change outcome: ${report.rollout?.changedCount || 0}`,
          ...((report.rollout?.rows || []).filter((entry) => entry.changed).slice(0, 5).map((entry) => `${entry.actionClass}: ${entry.currentStatus} -> ${entry.candidateStatus}`)),
        ],
      },
      {
        label: "Next commands",
        lines: [
          `  nornr-sentry --trust-advisor`,
          `  nornr-sentry --eval-harness --trust-mode ${report.recommendation?.winnerMode || "standard"}`,
        ],
      },
    ],
    footer: ["Trust advisor is a clean-room recommendation from local record history, not a hosted control-plane policy engine."],
  });
}
