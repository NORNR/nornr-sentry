import { spawnSync } from "node:child_process";

import { pickByDensity, renderHero, renderSurface, terminalDensityFlags } from "./terminal-theme.js";

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

function stripTrailingPeriod(value = "") {
  return String(value || "").trim().replace(/[.]+$/, "");
}

function compactWhitespace(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

export function supportedShareVariants() {
  return ["summary", "x", "slack", "issue", "markdown"];
}

export function shareVariantLabel(variant = "summary") {
  const normalized = String(variant || "summary").trim().toLowerCase();
  if (normalized === "x") return "Copy X post";
  if (normalized === "slack") return "Copy Slack update";
  if (normalized === "issue") return "Copy issue update";
  if (normalized === "markdown") return "Copy markdown";
  return "Copy public-safe summary";
}

export function buildShareVariants(result = {}) {
  const sharePack = result.sharePack || {};
  const verdict = titleCase(String(sharePack.verdict || "blocked").replace(/_/g, " ")) || "Blocked";
  const lane = actionClassLabel(sharePack.intent?.actionClass || "unknown");
  const proofId = String(sharePack.recordId || "local").trim() || "local";
  const headline = firstNonEmpty(
    sharePack.headline,
    sharePack.artifactSummary,
    `Blocked ${lane}`,
  );
  const reason = compactWhitespace(firstNonEmpty(sharePack.reason, sharePack.artifactSummary, "Dangerous action stopped before becoming real."));
  const operatorAction = titleCase(String(sharePack.operatorAction || "Block").replace(/_/g, " ")) || "Block";
  const safeReason = stripTrailingPeriod(reason);
  const summary = [
    `NORNR Sentry defended record · ${verdict} · ${lane}`,
    `Proof id ${proofId}`,
    safeReason ? `${safeReason}.` : "",
  ].filter(Boolean).join("\n");

  const xCore = compactWhitespace(`NORNR Sentry ${String(verdict || "Blocked").toLowerCase()} ${lane.toLowerCase()} before it became real. Proof ${proofId}. ${safeReason}. Artifact kept as a defended record.`);
  const x = xCore.length <= 280 ? xCore : `${xCore.slice(0, 277).trimEnd()}...`;

  const slack = [
    `NORNR Sentry defended record: ${verdict} · ${lane}`,
    `• Proof: ${proofId}`,
    `• Action: ${headline}`,
    `• Why it mattered: ${safeReason}`,
    `• Artifact: defended record + portable export + share pack`,
  ].join("\n");

  const issue = [
    `Defended record: ${verdict} · ${lane}`,
    "",
    `- Proof id: ${proofId}`,
    `- Action: ${headline}`,
    `- Operator action: ${operatorAction}`,
    `- Why it mattered: ${safeReason}`,
    "- Artifact: defended record + portable export + share pack",
  ].join("\n");

  const markdown = [
    `## NORNR Sentry defended record`,
    "",
    `- **Verdict:** ${verdict}`,
    `- **Lane:** ${lane}`,
    `- **Proof id:** ${proofId}`,
    `- **Action:** ${headline}`,
    `- **Operator action:** ${operatorAction}`,
    `- **Why it mattered:** ${safeReason}`,
    `- **Artifact:** defended record + portable export + share pack`,
  ].join("\n");

  return { summary, x, slack, issue, markdown };
}

export function buildShareCopyEntries(result = {}, shield = "cursor") {
  const recordPath = String(result.filePath || result.recordPath || "latest").trim() || "latest";
  const displayTarget = recordPath.includes("/") ? "<current-record>" : recordPath;
  return supportedShareVariants().map((variant) => ({
    label: shareVariantLabel(variant),
    argv: ["--client", shield, "--export-record", recordPath, "--copy-share", variant],
    commandLines: [`nornr-sentry --client ${shield} --export-record ${displayTarget} --copy-share ${variant}`],
    detailLines: [
      variant === "summary"
        ? "Short public-safe artifact summary."
        : variant === "x"
          ? "Short social post for X."
          : variant === "slack"
            ? "Team update for Slack or chat."
            : variant === "issue"
              ? "Bullet update for an issue or task."
              : "Markdown block for docs, PRs, or notes.",
    ],
  }));
}

function copyWith(command, args, text) {
  const result = spawnSync(command, args, {
    input: text,
    encoding: "utf8",
    stdio: ["pipe", "ignore", "pipe"],
  });
  return result.status === 0;
}

export function copyTextToClipboard(text = "") {
  const value = String(text || "");
  if (!value.trim()) {
    return { ok: false, method: "", error: "Nothing to copy." };
  }

  try {
    if (process.platform === "darwin" && copyWith("pbcopy", [], value)) {
      return { ok: true, method: "pbcopy" };
    }
    if (process.platform === "win32" && copyWith("cmd", ["/c", "clip"], value)) {
      return { ok: true, method: "clip" };
    }
    if (copyWith("wl-copy", [], value)) {
      return { ok: true, method: "wl-copy" };
    }
    if (copyWith("xclip", ["-selection", "clipboard"], value)) {
      return { ok: true, method: "xclip" };
    }
    if (copyWith("xsel", ["--clipboard", "--input"], value)) {
      return { ok: true, method: "xsel" };
    }
  } catch {
    // Fall through to manual-copy response below.
  }

  return {
    ok: false,
    method: "",
    error: "Clipboard command not available. Copy the text manually from the surface below.",
  };
}

export function buildShareCopyResult(result = {}, variant = "summary") {
  const normalizedVariant = supportedShareVariants().includes(String(variant || "").trim())
    ? String(variant || "summary").trim()
    : "summary";
  const variants = result.shareVariants || buildShareVariants(result);
  const text = String(variants[normalizedVariant] || variants.summary || "").trim();
  const clipboard = copyTextToClipboard(text);
  return {
    kind: "nornr.sentry.share_copy_result.v1",
    variant: normalizedVariant,
    label: shareVariantLabel(normalizedVariant),
    text,
    lines: text.split("\n").filter(Boolean),
    clipboard,
  };
}

export function buildShareCopyResultView(result = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.share_copy_result_surface.v1",
    columns,
    density,
    twoColumn: false,
    hero: {
      status: result.clipboard?.ok ? "COPIED" : "SHARE COPY",
      lines: [
        result.label || "Share copy",
        pickByDensity({
          compact: result.clipboard?.ok ? "Share text copied." : "Share text ready to copy.",
          standard: result.clipboard?.ok ? `Share text copied via ${result.clipboard.method}.` : "Clipboard copy was not available, so the share text is shown below.",
          wide: result.clipboard?.ok ? `Share text copied via ${result.clipboard.method}. Paste it directly into X, Slack, an issue, or a doc.` : `Clipboard copy was not available, so the share text is shown below for manual copy into X, Slack, an issue, or a doc.`,
        }, density),
      ],
    },
    sections: [
      {
        label: "Share text",
        lines: result.lines || [],
      },
      {
        label: "Use this next",
        lines: [
          "Public-safe summary is best for quick proof.",
          "X is best for short launch proof.",
          "Slack and issue variants are best for team handoff.",
        ],
      },
    ],
    footer: compact ? [] : [result.clipboard?.ok ? "Copied successfully." : result.clipboard?.error || "Copy manually from the text above."],
  };
}

export function renderShareCopyResult(result = {}) {
  const view = buildShareCopyResultView(result);
  return renderSurface({
    hero: renderHero(view.hero),
    sections: (view.sections || []).map((section) => ({
      label: section.label,
      lines: section.lines || [],
    })),
    footer: view.footer,
  });
}
