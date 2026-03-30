import { buildServeActivitySections } from "./serve-activity.js";
import { pickByDensity, renderHero, renderSurface, terminalDensityFlags } from "./terminal-theme.js";
import { formatDisplayPath, resolveRecordRootDir } from "./storage-paths.js";

function enabledLabel(value) {
  return value ? "enabled" : "disabled";
}

function normalizeRuntimeContext(value = "") {
  return String(value || "").trim() === "serve" ? "serve" : "welcome";
}

function formatLiveRuntimeEventLines(events = [], compact = false) {
  return (Array.isArray(events) ? events : [])
    .slice(0, compact ? 2 : 4)
    .map((event) => {
      const stamp = String(event?.changedAt || "").slice(11, 19) || "now";
      const summary = String(event?.summary || "Live runtime updated.").trim();
      return `- ${stamp} | ${summary}`;
    });
}

export function buildRuntimeServeArgv(options = {}, overrides = {}) {
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const port = Number(options.port || 4317) || 4317;
  const shadowMode = overrides.shadowMode ?? Boolean(options.shadowMode);
  const ambientTrust = overrides.ambientTrust ?? Boolean(options.ambientTrust);
  const verbose = overrides.verbose ?? Boolean(options.verbose);
  const noUpstream = overrides.noUpstream ?? Boolean(options.noUpstream);
  const argv = ["--client", shield, "--serve", "--port", String(port)];
  if (shadowMode) argv.push("--shadow-mode");
  if (ambientTrust) argv.push("--ambient-trust");
  if (verbose) argv.push("--verbose");
  if (noUpstream) {
    argv.push("--no-upstream");
  } else if (options.upstreamUrl) {
    argv.push("--upstream-url", String(options.upstreamUrl));
  }
  return argv;
}

function buildRuntimeServeCommandLines(options = {}, overrides = {}, density = "standard") {
  const argv = buildRuntimeServeArgv(options, overrides);
  const client = String(options.shield || "cursor").trim() || "cursor";
  const displayTokens = ["--client", client, ...argv.slice(2)];
  if (density === "compact") {
    const lines = ["nornr-sentry", `  --client ${client}`];
    for (let index = 2; index < displayTokens.length; index += 1) {
      const token = displayTokens[index];
      if ((token === "--port" || token === "--upstream-url") && displayTokens[index + 1]) {
        lines.push(`  ${token} ${displayTokens[index + 1]}`);
        index += 1;
        continue;
      }
      lines.push(`  ${token}`);
    }
    return lines;
  }
  return [`nornr-sentry ${displayTokens.join(" ")}`];
}

export function buildRuntimeConfigView(options = {}, explicitColumns) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const port = Number(options.port || 4317) || 4317;
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const runtimeContext = normalizeRuntimeContext(options.runtimeContext);
  const liveRuntime = Boolean(options.liveRuntime);
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const healthUrl = `http://127.0.0.1:${port}/health`;
  const liveRuntimeLines = formatLiveRuntimeEventLines(options.liveRuntimeEvents, compact);

  const serveActivitySections = runtimeContext === "serve"
    ? buildServeActivitySections(options.serveActivity, { compact, shield })
    : [];

  return {
    kind: "nornr.sentry.runtime_config.v1",
    columns,
    density,
    compact,
    twoColumn: !compact && columns >= 92,
    minWidth: 56,
    minHeight: 16,
    hero: {
      status: runtimeContext === "serve" && liveRuntime ? "LIVE RUNTIME" : "RUNTIME",
      lines: [
        `Client ${shield} | Port ${port}`,
        runtimeContext === "serve"
          ? liveRuntime
            ? pickByDensity({
              compact: "Adjust live runtime posture while serve stays up.",
              standard: "Adjust live runtime posture while the local boundary stays up.",
              wide: "Adjust live runtime posture while the live local boundary stays up.",
            }, density)
            : pickByDensity({
              compact: "Adjust runtime posture before restarting serve.",
              standard: "Adjust runtime posture, then restart the local boundary.",
              wide: "Adjust runtime posture before restarting the live local boundary.",
            }, density)
          : pickByDensity({
            compact: "Adjust runtime posture before starting serve.",
            standard: "Adjust runtime posture, then start the local boundary.",
            wide: "Adjust runtime posture before starting the local boundary for real client actions.",
          }, density),
      ],
    },
    runtimeOptions: [
      {
        key: "shadowMode",
        label: "Shadow mode",
        enabled: Boolean(options.shadowMode),
        detail: "Let risky requests pass while still capturing defended records.",
      },
      {
        key: "ambientTrust",
        label: "Ambient trust",
        enabled: Boolean(options.ambientTrust),
        detail: "Emit a quiet trust heartbeat while the server stays up.",
      },
      {
        key: "verbose",
        label: "Verbose trace",
        enabled: Boolean(options.verbose),
        detail: "Print a colder, fuller decision trace while the server runs.",
      },
    ],
    applyLine: runtimeContext === "serve"
      ? liveRuntime
        ? "Apply updates the live server posture without restarting."
        : "Apply restarts the local server with this runtime posture."
      : "Apply starts the local server with this runtime posture.",
    sections: [
      {
        label: runtimeContext === "serve" ? "Operator station" : "Connection",
        lines: [
          `OpenAI base URL: ${baseUrl}`,
          `Health: ${healthUrl}`,
          `Upstream relay: ${enabledLabel(Boolean(options.upstreamUrl))}`,
          options.upstreamUrl ? `Upstream URL: ${options.upstreamUrl}` : "Upstream URL: not configured",
          ...(runtimeContext === "serve" ? [`Record root: ${formatDisplayPath(resolveRecordRootDir(options), options)}`] : []),
          ...(runtimeContext === "serve" && !options.upstreamUrl && options.shadowMode ? ["Provider key: not required in this shadow-first posture"] : []),
        ],
      },
      {
        label: "Controls",
        lines: compact
          ? [
            "Use arrows to select a runtime toggle.",
            "Space or left/right toggles the selected setting.",
            liveRuntime && runtimeContext === "serve"
              ? "Enter applies live. Esc/back returns. q closes."
              : "Enter or a applies. q closes.",
          ]
          : [
            "Use up/down to select a runtime toggle.",
            "Left/right or Space toggles the selected setting.",
            runtimeContext === "serve"
              ? liveRuntime
                ? "Enter applies the selected posture live without restarting the server."
                : "Enter or a restarts serve with the selected posture. q closes."
              : "Enter or a starts serve with the selected posture. q closes.",
            runtimeContext === "serve"
              ? "This screen is the live operator station for the current local boundary."
              : ": command palette is available here too.",
            liveRuntime ? "Esc or b returns to the previous serve surface. h returns home." : null,
          ].filter(Boolean),
      },
      ...serveActivitySections,
      ...(liveRuntimeLines.length ? [{
        label: "Live changes",
        lines: liveRuntimeLines,
      }] : []),
    ],
    footer: [
      `Record root: ${formatDisplayPath(resolveRecordRootDir(options), options)}`,
      runtimeContext === "serve"
        ? liveRuntime
          ? "Runtime changes here affect the current live serve session only."
          : "Current live serve state is shown above; apply makes the next live state real."
        : "This panel previews the serve posture before the server becomes live.",
    ],
    buildServeArgv: (overrides = {}) => buildRuntimeServeArgv(options, overrides),
    buildServeCommandLines: (overrides = {}) => buildRuntimeServeCommandLines(options, overrides, density),
  };
}

export function renderRuntimeConfig(options = {}) {
  const view = buildRuntimeConfigView(options);
  return renderSurface({
    hero: renderHero(view.hero),
    sections: [
      {
        label: "Runtime",
        lines: view.runtimeOptions.map((entry) => `${entry.label}: ${enabledLabel(entry.enabled)}`),
      },
      ...view.sections,
      {
        label: "Command preview",
        lines: [
          ...view.buildServeCommandLines(),
          view.applyLine,
        ],
      },
    ],
    footer: view.footer,
  });
}
