import { buildGoldenPathStepEntries } from "./golden-path.js";
import { buildServeActivitySections } from "./serve-activity.js";
import { pickByDensity, renderHero, renderSurface, terminalDensityFlags } from "./terminal-theme.js";
import { formatDisplayPath, resolveRecordRootDir } from "./storage-paths.js";

function enabledLabel(value) {
  return value ? "enabled" : "disabled";
}

export function buildServeStatusView(options = {}, explicitColumns) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const port = Number(options.port || 4317) || 4317;
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const healthUrl = `http://127.0.0.1:${port}/health`;

  const serveActivitySections = buildServeActivitySections(options.serveActivity, { compact, shield });
  const goldenPath = buildGoldenPathStepEntries({ ...options, shield, port }).slice(0, compact ? 2 : 4);

  return {
    kind: "nornr.sentry.serve_status.v1",
    columns,
    density,
    twoColumn: !compact && columns >= 92,
    minWidth: 52,
    minHeight: 12,
    hero: {
      status: "LISTENING",
      lines: [
        `Client ${shield} | Port ${port}`,
        pickByDensity({
          compact: "Local operator station is live.",
          standard: "Local operator station is live for consequential agent actions.",
          wide: "Local operator station is live between agent intent and consequential action.",
        }, density),
      ],
    },
    sections: [
      ...(Array.isArray(options.guidedSetupSummary) && options.guidedSetupSummary.length ? [{
        label: "Setup",
        lines: options.guidedSetupSummary,
      }] : []),
      {
        label: "Operator station",
        lines: [
          `OpenAI base URL: ${baseUrl}`,
          `Health: ${healthUrl}`,
          `Record root: ${formatDisplayPath(resolveRecordRootDir(options), options)}`,
          `Upstream relay: ${enabledLabel(Boolean(options.upstreamUrl))}`,
          ...(!options.upstreamUrl && options.shadowMode ? ["Provider key: not required in this shadow-first posture"] : []),
        ],
      },
      {
        label: "Live posture",
        lines: [
          `Shadow mode: ${enabledLabel(Boolean(options.shadowMode))}`,
          `Remote approval: ${enabledLabel(Boolean(options.remoteApprovalWebhook || options.remoteApprovalPublicBaseUrl))}`,
          `Ambient trust: ${enabledLabel(Boolean(options.ambientTrust))}`,
        ],
      },
      ...(options.shadowMode ? [{
        label: "Observe-first safety",
        lines: compact
          ? ["Watch-only posture. Nothing is blocked yet."]
          : [
            "Watch-only posture: shadow mode keeps the lane visible without enforcing the stop yet.",
            "No provider key or upstream relay is required in this posture when --no-upstream is active.",
            "Use the runtime panel when you are ready to turn observation into real enforcement.",
          ],
      }] : []),
      ...serveActivitySections,
      {
        label: "Golden path",
        entries: goldenPath,
      },
      {
        label: "Controls",
        lines: compact
          ? [
            "q / Enter / Ctrl+C stops the server.",
            ": command palette available here too.",
          ]
          : [
            "q, Enter, or Ctrl+C stops the local server.",
            ": command palette is available here too.",
            `Patch client: nornr-sentry --client ${shield} --patch-client`,
            `Run demo stop: nornr-sentry --client ${shield} --demo destructive_shell`,
          ],
      },
    ],
    footer: compact ? [] : [
      "Server stays live until you close this surface.",
      "Use the runtime panel to change live posture without restarting the local boundary.",
    ],
  };
}

export function renderServeStatus(options = {}) {
  const view = buildServeStatusView(options);
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
