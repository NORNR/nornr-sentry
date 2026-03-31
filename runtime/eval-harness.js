import { evaluateIntent } from "../decisions/evaluate.js";
import { classifyDemoIntent } from "../intent/classify.js";
import {
  buildDefaultMandate,
  defaultProtectPresetForShield,
  normalizeTrustMode,
  supportedTrustModes,
  trustModeLabel,
} from "../mandates/defaults.js";
import { buildDecisionSupport } from "./decision-support.js";
import { laneFamilyForActionClass } from "./record-insights.js";
import { renderHero, renderSurface } from "./terminal-theme.js";

const DEFAULT_SCENARIOS = [
  "destructive_shell",
  "write_outside_scope",
  "vendor_mutation",
  "outbound_message",
  "paid_action",
  "credential_exfiltration",
  "production_mutation",
  "read_only",
];

const EVAL_PACKS = {
  all: DEFAULT_SCENARIOS,
  repo: ["destructive_shell", "write_outside_scope", "read_only"],
  secrets: ["credential_exfiltration", "outbound_message"],
  finance: ["paid_action", "vendor_mutation"],
  production: ["production_mutation", "vendor_mutation", "destructive_shell"],
  outbound: ["outbound_message", "credential_exfiltration"],
};

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function titleCase(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusLabel(status = "") {
  const normalized = normalizeText(status) || "unknown";
  if (normalized === "approved_once") return "approved once";
  return normalized.replace(/_/g, " ");
}

function resolveEvalPack(value = "") {
  const normalized = normalizeText(value).toLowerCase();
  return EVAL_PACKS[normalized] ? normalized : "all";
}

export function buildEvalHarness(options = {}) {
  const shield = normalizeText(options.shield || "cursor") || "cursor";
  const protectPreset = normalizeText(options.protectPreset || defaultProtectPresetForShield(shield)) || defaultProtectPresetForShield(shield);
  const explicitTrustMode = normalizeTrustMode(options.trustMode || "");
  const trustModes = explicitTrustMode ? [explicitTrustMode] : supportedTrustModes();
  const evalPack = resolveEvalPack(options.evalPack || "all");
  const scenarios = EVAL_PACKS[evalPack].map((demo) => classifyDemoIntent(demo));
  const modes = trustModes.map((trustMode) => {
    const mandate = buildDefaultMandate(shield, {
      ...options,
      protectPreset,
      trustMode,
    });
    const rows = scenarios.map((intent) => {
      const decision = evaluateIntent(intent, mandate);
      const support = buildDecisionSupport(intent, decision, mandate, {}, { shield });
      return {
        scenario: intent.actionClass,
        family: laneFamilyForActionClass(intent.actionClass),
        title: intent.title,
        status: decision.status,
        primaryReason: decision.primaryReason,
        safestAction: support.safestAction,
        why: support.why,
      };
    });
    return {
      trustMode,
      label: trustModeLabel(trustMode),
      mandate,
      rows,
      counts: {
        blocked: rows.filter((row) => row.status === "blocked").length,
        approved: rows.filter((row) => row.status === "approved").length,
      },
    };
  });

  const focus = modes
    .map((mode) => `${mode.label}: ${mode.counts.blocked} blocked / ${mode.counts.approved} approved`)
    .join(" · ");

  return {
    kind: "nornr.sentry.eval_harness.v1",
    shield,
    protectPreset,
    evalPack,
    evalPackLabel: titleCase(evalPack),
    modes,
    focus,
  };
}

export function renderEvalHarness(report = {}) {
  return renderSurface({
    hero: renderHero({
      status: "EVAL HARNESS",
      lines: [
        `Client ${report.shield || "cursor"} · ${report.evalPackLabel || "All"} scenario pack`,
        report.focus || "Compare the same dangerous lanes under multiple clean-room trust modes.",
      ],
    }),
    sections: [
      {
        label: "Scenario pack",
        lines: [
          `Pack: ${report.evalPackLabel || "All"}`,
          `Protect preset: ${report.protectPreset || "repo"}`,
          `Trust modes compared: ${(report.modes || []).length}`,
        ],
      },
      ...(report.modes || []).map((mode) => ({
        label: `${mode.label} (${normalizeText(mode.trustMode) || "standard"})`,
        lines: [
          `Blocked: ${mode.counts?.blocked || 0} · Approved: ${mode.counts?.approved || 0}`,
          ...mode.rows.map((row) => `${titleCase(row.scenario.replace(/_/g, " "))}: ${statusLabel(row.status)} · ${row.safestAction} · ${row.primaryReason}`),
        ],
      })),
      {
        label: "Next commands",
        lines: [
          `  nornr-sentry --eval-harness --eval-pack ${report.evalPack || "all"}`,
          `  nornr-sentry --trust-advisor`,
        ],
      },
    ],
    footer: ["Use eval-harness to compare whether the current trust mode matches the product story you want to ship."],
  });
}
