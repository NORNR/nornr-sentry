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
  const shadowMode = Boolean(options.shadowMode);
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  const healthUrl = `http://127.0.0.1:${port}/health`;
  const liveRuntimeLines = formatLiveRuntimeEventLines(options.liveRuntimeEvents, compact);
  const hasRequests = Number(options.serveActivity?.totals?.total || 0) > 0;

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
      status: runtimeContext === "serve"
        ? shadowMode
          ? "OBSERVE FIRST"
          : liveRuntime
            ? "LIVE RUNTIME"
            : "RUNTIME"
        : "RUNTIME",
      lines: [
        `Client ${shield} | Port ${port}`,
        runtimeContext === "serve"
          ? shadowMode
            ? pickByDensity({
              compact: "Watch-only shadow mode. Nothing is blocked yet.",
              standard: "Watch-only shadow mode. Nothing is blocked yet while the first lanes arrive.",
              wide: "Watch-only shadow mode is live. Nothing is blocked yet, so you can inspect the first lanes before enforcing the boundary.",
            }, density)
            : liveRuntime
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
      ...(runtimeContext === "serve" && shadowMode ? [{
        label: "Observe-first safety",
        lines: compact
          ? [
            "Watch-only posture.",
            hasRequests ? "Traffic is arriving now." : "Waiting for the first lane.",
          ]
          : [
            "Watch-only posture before enforcement.",
            !options.upstreamUrl ? "No provider key or upstream relay is required yet." : "Upstream relay can stay off while you validate the first local lanes.",
            hasRequests ? "Traffic is already arriving." : "The first risky lane appears here when traffic arrives.",
          ],
      }] : []),
      {
        label: runtimeContext === "serve" ? "Station" : "Connection",
        lines: [
          `OpenAI base URL: ${baseUrl}`,
          `Health: ${healthUrl}`,
          `Upstream relay: ${enabledLabel(Boolean(options.upstreamUrl))}`,
          ...(runtimeContext === "serve" ? [`Record root: ${formatDisplayPath(resolveRecordRootDir(options), options)}`] : []),
          ...(runtimeContext === "serve" && !options.upstreamUrl && shadowMode ? ["Provider key: not required in this shadow-first posture"] : []),
        ],
      },
      ...serveActivitySections,
      ...(runtimeContext === "serve" ? [{
        label: "Next action",
        compactEntries: true,
        entries: shadowMode
          ? [
            {
              label: "Run demo stop",
              argv: ["--client", shield, "--demo", "destructive_shell"],
              commandLines: [`nornr-sentry --client ${shield} --demo destructive_shell`],
              compactCommandLines: ["nornr-sentry --demo destructive_shell"],
              detailLines: ["Create one obvious first stop."],
              compactDetailLines: [],
            },
            {
              label: "Open proof queue",
              argv: ["--client", shield, "--records"],
              commandLines: [`nornr-sentry --client ${shield} --records`],
              compactCommandLines: ["nornr-sentry --records"],
              detailLines: ["Open the proof queue after the first real lane appears."],
              compactDetailLines: [],
            },
            {
              label: "Serve for real",
              argv: ["--client", shield, "--serve", "--port", String(port)],
              commandLines: [`nornr-sentry --client ${shield} --serve --port ${port}`],
              compactCommandLines: ["nornr-sentry --serve"],
              detailLines: ["Leave observe-first once the lane and proof look right."],
              compactDetailLines: [],
            },
          ]
          : [
            {
              label: liveRuntime ? "Apply live posture" : "Apply posture",
              argv: [],
              commandLines: [liveRuntime ? "Press a to apply live." : "Press a to apply."],
              compactCommandLines: [liveRuntime ? "Press a to apply live." : "Press a to apply."],
              detailLines: ["Commit the selected runtime toggle."],
              compactDetailLines: [],
            },
            {
              label: "Open proof queue",
              argv: ["--client", shield, "--records"],
              commandLines: [`nornr-sentry --client ${shield} --records`],
              compactCommandLines: ["nornr-sentry --records"],
              detailLines: ["Browse the real local proof objects created by the current boundary."],
              compactDetailLines: [],
            },
          ],
      }] : []),
      ...(liveRuntimeLines.length ? [{
        label: "Live changes",
        lines: liveRuntimeLines,
      }] : []),
    ],
    footer: [
      runtimeContext === "serve"
        ? shadowMode
          ? "Observe-first stays watch-only until you deliberately enforce it."
          : liveRuntime
            ? "Runtime changes here affect only the current live serve session."
            : "Current live serve state is shown above; apply makes the next live state real."
        : "This panel previews the serve posture before the server becomes live.",
    ],
    buildServeArgv: (overrides = {}) => buildRuntimeServeArgv(options, overrides),
    buildServeCommandLines: (overrides = {}) => buildRuntimeServeCommandLines(options, overrides, density),
  };
}

export function renderRuntimeConfig(options = {}) {
  const view = buildRuntimeConfigView(options);
  const observeFirst = Boolean(options.runtimeContext === "serve" && options.shadowMode);
  return renderSurface({
    hero: renderHero(view.hero),
    sections: [
      {
        label: observeFirst ? "Observe posture" : "Runtime",
        lines: view.runtimeOptions.map((entry) => `${entry.label}: ${enabledLabel(entry.enabled)}`),
      },
      ...(view.sections || []).map((section) => ({
        label: section.label,
        lines: section.lines || (section.entries || []).flatMap((entry, index) => ([
          ...(index ? [""] : []),
          entry.label || "",
          ...((entry.commandLines || []).map((line) => `  ${line}`)),
          ...((entry.detailLines || []).map((line) => `  ${line}`)),
        ].filter(Boolean))),
      })),
      ...(!observeFirst ? [{
        label: "Command preview",
        lines: [
          ...view.buildServeCommandLines(),
          view.applyLine,
        ],
      }] : []),
    ],
    footer: view.footer,
  });
}
