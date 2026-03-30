import {
  currentTerminalColumns,
  pickByDensity,
  renderHero,
  renderSurface,
  terminalDensity,
} from "./terminal-theme.js";
import { inspectGuidedSetup, buildGuidedSetupArgv, buildObserveFirstArgv } from "./first-run.js";
import { defaultProtectPresetForShield } from "../mandates/defaults.js";

const MIN_WELCOME_WIDTH = 52;

function normalizeLines(value = []) {
  return (Array.isArray(value) ? value : [value])
    .flatMap((entry) => String(entry ?? "").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildWelcomeCommandLines(shield = "cursor", suffix = "", layout = "single") {
  const normalizedSuffix = String(suffix || "").trim();
  const prefix = "nornr-sentry";
  const normalizedShield = String(shield || "").trim();
  const clientLine = normalizedShield ? `--client ${normalizedShield}` : "";
  const baseLine = [prefix, clientLine].filter(Boolean).join(" ");
  if (!normalizedSuffix) return layout === "stacked" ? [prefix, ...(clientLine ? [clientLine] : [])] : [baseLine || prefix];
  if (layout === "single") return [`${baseLine || prefix} ${normalizedSuffix}`.trim()];
  if (layout === "split") return [baseLine || prefix, normalizedSuffix];
  return [prefix, ...(clientLine ? [clientLine] : []), normalizedSuffix];
}

function buildWelcomeEntry(label, commandLines, detail = "") {
  return {
    label,
    commandLines: normalizeLines(commandLines),
    detailLines: normalizeLines(detail),
  };
}

function buildHomeCommandLines(shield = "cursor", mode = "first-stop", layout = "single") {
  if (mode === "patch") return buildWelcomeCommandLines("", "--patch-client", layout);
  if (mode === "guided-setup") return buildWelcomeCommandLines(shield, "--guided-setup", layout);
  if (mode === "observe") return buildWelcomeCommandLines(shield, "--serve --shadow-mode", layout);
  if (mode === "serve") return buildWelcomeCommandLines(shield, "--serve", layout);
  if (mode === "records") return buildWelcomeCommandLines(shield, "--records", layout);
  if (mode === "replay") return buildWelcomeCommandLines(shield, "--policy-replay", layout);
  return buildWelcomeCommandLines(shield, "--first-stop", layout);
}

function renderEntryLines(entry = {}) {
  return [
    entry.label,
    ...normalizeLines(entry.commandLines).map((line) => `  ${line}`),
    ...normalizeLines(entry.detailLines).map((line) => `  ${line}`),
  ];
}

function parsePalettePort(rawValue, fallbackPort = 4317) {
  const value = Number(rawValue || 0);
  return Number.isFinite(value) && value > 0 ? value : fallbackPort;
}

function buildServeCommandLines(argv = [], layout = "single") {
  const normalized = Array.isArray(argv) ? argv.slice() : [];
  const clientIndex = normalized.indexOf("--client");
  const shieldIndex = normalized.indexOf("--shield");
  const client = clientIndex >= 0 && normalized[clientIndex + 1]
    ? String(normalized[clientIndex + 1])
    : shieldIndex >= 0 && normalized[shieldIndex + 1]
      ? String(normalized[shieldIndex + 1])
      : "cursor";
  const suffixTokens = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const token = normalized[index];
    if (token === "--shield" || token === "--client") {
      index += 1;
      continue;
    }
    if (token === "--port") {
      suffixTokens.push(`${token} ${normalized[index + 1] || 4317}`);
      index += 1;
      continue;
    }
    suffixTokens.push(token);
  }
  const suffix = suffixTokens.filter((token) => token !== "nornr-sentry").join(" ");
  return buildWelcomeCommandLines(client, suffix, layout);
}

function buildGuidedSetupDetailLines(setup = {}, density = "standard") {
  const lines = [];
  const patchClient = setup.patch?.clientLabel || "client";
  if (setup.patch?.clientDetected) {
    lines.push(`Detected ${patchClient}.`);
  }
  if (setup.patch?.serverPatched) {
    lines.push(`${patchClient} is already patched into the local boundary.`);
  } else if (setup.patch?.canPatch) {
    lines.push(`Will patch ${patchClient} into the local boundary.`);
  }
  if (setup.mandate?.projectScope?.projectName) {
    lines.push(`Proposed mandate: read/write inside ${setup.mandate.projectScope.projectName}, block everything else.`);
  }
  lines.push("Starts in shadow mode first. No provider key required.");
  if (density !== "compact") {
    lines.push("Press y to secure now. Press n to open the manual path.");
  }
  return lines;
}

export function resolveSentryPaletteCommand(options = {}, rawInput = "") {
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const fallbackPort = parsePalettePort(options.port, 4317);
  const runtimeContext = options.serve ? "serve" : (String(options.runtimeContext || "").trim() || "welcome");
  const setup = inspectGuidedSetup({
    ...options,
    shield,
    port: fallbackPort,
  });
  const normalized = String(rawInput || "").trim().replace(/^[:/]\s*/, "");
  if (!normalized) return { kind: "empty" };

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const command = String(tokens.shift() || "").toLowerCase();
  const firstArg = String(tokens[0] || "").trim();
  const secondArg = String(tokens[1] || "").trim();

  switch (command) {
    case "replay":
    case "attack":
    case "attack-me":
      return { kind: "launch", argv: ["--client", shield, "--policy-replay"], label: "Replay attacks" };
    case "patch":
    case "patch-client":
      return { kind: "launch", argv: ["--patch-client"], label: "Choose patch / wiring" };
    case "verify":
    case "verify-patch":
      return { kind: "launch", argv: ["--verify-patch"], label: "Choose verify target" };
    case "setup":
    case "secure":
    case "secure-now":
      return { kind: "launch", argv: buildGuidedSetupArgv({ ...options, shield, port: fallbackPort }, setup), label: "Secure now" };
    case "observe":
    case "shadow":
    case "shadow-first":
      return { kind: "launch", argv: buildObserveFirstArgv({ ...options, shield, port: fallbackPort }), label: "Observe first" };
    case "serve": {
      const port = firstArg === "--port" ? parsePalettePort(secondArg, fallbackPort) : parsePalettePort(firstArg, fallbackPort);
      const argv = ["--client", shield, "--serve", "--port", String(port)];
      if (options.shadowMode) argv.push("--shadow-mode");
      if (options.noUpstream) argv.push("--no-upstream");
      return { kind: "launch", argv, label: "Serve for real" };
    }
    case "runtime": {
      const argv = ["--client", shield, "--runtime-panel", "--runtime-context", runtimeContext, "--port", String(fallbackPort)];
      if (options.shadowMode) argv.push("--shadow-mode");
      if (options.ambientTrust) argv.push("--ambient-trust");
      if (options.verbose) argv.push("--verbose");
      if (options.upstreamUrl) argv.push("--upstream-url", String(options.upstreamUrl));
      return { kind: "launch", argv, label: "Runtime" };
    }
    case "records":
      return { kind: "launch", argv: ["--client", shield, "--records"], label: "Defended records" };
    case "share":
    case "export-proof":
      return { kind: "launch", argv: ["--client", shield, "--export-record", "latest"], label: "Export defended record" };
    case "copy-share":
      return { kind: "launch", argv: ["--client", shield, "--export-record", "latest", "--copy-share", firstArg || "summary"], label: "Copy share proof" };
    case "first-stop":
    case "first":
      return { kind: "launch", argv: ["--client", shield, "--first-stop", "--protect", options.protectPreset || defaultProtectPresetForShield(shield)], label: "First stop" };
    case "protect":
    case "presets":
    case "protect-presets":
      return { kind: "launch", argv: ["--client", shield, "--protect-presets", "--protect", options.protectPreset || defaultProtectPresetForShield(shield)], label: "Protect presets" };
    case "clients":
    case "client-paths":
      return { kind: "launch", argv: ["--client", shield, "--client-paths"], label: "Client paths" };
    case "scale":
    case "scale-path":
      return { kind: "launch", argv: ["--client", shield, "--scale-path"], label: "Scale path" };
    case "proof":
    case "proof-hub":
      return { kind: "launch", argv: ["--client", shield, "--proof-hub"], label: "Proof hub" };
    case "golden":
    case "golden-path":
    case "wizard":
      return { kind: "launch", argv: ["--client", shield, "--golden-path", "--port", String(fallbackPort)], label: "Golden path" };
    case "demo": {
      const scenario = firstArg || "destructive_shell";
      return { kind: "launch", argv: ["--client", shield, "--demo", scenario], label: "Run demo stop" };
    }
    case "summary":
      return { kind: "launch", argv: ["--client", shield, "--summary"], label: "Summary" };
    case "welcome":
    case "home":
      return { kind: "launch", argv: [], label: "Welcome" };
    case "quit":
    case "exit":
    case "close":
      return { kind: "exit", label: "Close" };
    default:
      return {
        kind: "error",
        message: `Unknown command: ${normalized}`,
      };
  }
}

export function buildWelcomeView(options = {}, explicitColumns = currentTerminalColumns()) {
  const shield = options.shield || "cursor";
  const port = options.port || 4317;
  const columns = Number(explicitColumns || 0) || 80;
  const density = terminalDensity(columns);
  const compact = density === "compact";
  const wide = density === "wide";
  const twoColumn = columns >= 92;
  const commandLayout = columns < 58 ? "stacked" : columns < 74 ? "split" : "single";
  const guidedSetup = inspectGuidedSetup({
    ...options,
    shield,
    port,
  });

  if (columns < MIN_WELCOME_WIDTH) {
    return {
      kind: "nornr.sentry.welcome_guard.v1",
      columns,
      density,
      hero: {
        status: "READY",
        lines: ["Local decision layer for consequential agent actions."],
      },
      guard: {
        title: "Viewport guard",
        lines: [
          `Current width: ${columns} columns`,
          `Minimum width: ${MIN_WELCOME_WIDTH} columns`,
          "Widen the terminal to see the full start surface.",
          "Demo, patch/wiring, and observe stay available once the surface clears.",
        ],
      },
      footer: [`Widen beyond ${MIN_WELCOME_WIDTH} columns.`],
      twoColumn: false,
    };
  }

  const startHere = [
    ...(guidedSetup.show ? [buildWelcomeEntry(
      "Secure now",
      buildHomeCommandLines(shield, "guided-setup", commandLayout),
      buildGuidedSetupDetailLines(guidedSetup, density),
    )] : []),
    buildWelcomeEntry(
      "Perfect first stop",
      buildHomeCommandLines(shield, "first-stop", commandLayout),
      pickByDensity({
        compact: "Install, prove one stop, then open the proof queue.",
        standard: "Run the shortest path from install to first stop to first defended record.",
        wide: "Run the shortest path from install to first stop to first defended record before you widen the product story.",
      }, density),
    ),
    buildWelcomeEntry(
      "Choose patch / wiring",
      buildHomeCommandLines("", "patch", commandLayout),
      pickByDensity({
        compact: "Choose Cursor, Claude Desktop, Windsurf, or provider wiring.",
        standard: "Choose Cursor, Claude Desktop, Windsurf, or provider wiring before you continue.",
        wide: "Choose Cursor, Claude Desktop, Windsurf, or a provider wiring path before you continue into the local boundary.",
      }, density),
    ),
    buildWelcomeEntry(
      "Observe first",
      buildHomeCommandLines(shield, "observe", commandLayout),
      pickByDensity({
        compact: "Start safely in shadow mode.",
        standard: "Start in shadow mode first. No provider key or upstream relay required.",
        wide: "Start in shadow mode first and see what would have been stopped before you configure upstream relay.",
      }, density),
    ),
  ];

  const nextStep = [
    buildWelcomeEntry(
      "Defended records",
      buildHomeCommandLines(shield, "records", commandLayout),
      pickByDensity({
        compact: "Browse real proof objects from the local boundary.",
        standard: "Browse real defended records from the local boundary.",
        wide: "Browse real defended records from the local boundary when you want the actual proof objects instead of synthetic replay scenarios.",
      }, density),
    ),
    buildWelcomeEntry(
      "Replay attacks",
      buildHomeCommandLines(shield, "replay", commandLayout),
      pickByDensity({
        compact: "Choose a synthetic attack scenario to replay.",
        standard: "Choose a synthetic attack scenario and replay it under the current local mandate.",
        wide: "Choose a synthetic attack scenario and replay it under the current local mandate when you want another focused proof pass.",
      }, density),
    ),
    buildWelcomeEntry(
      "Serve for real",
      buildHomeCommandLines(shield, "serve", commandLayout),
      pickByDensity({
        compact: "Use after patching when you are ready for real traffic.",
        standard: "Run the local decision layer for real client actions once the client is patched.",
        wide: "Run the local decision layer for real client actions once the client is patched and you are done observing.",
      }, density),
    ),
  ];

  const sections = [
    {
      label: "Start here",
      entries: startHere,
    },
    {
      label: "Next step",
      entries: nextStep,
    },
  ];

  return {
    kind: "nornr.sentry.welcome.v1",
    columns,
    density,
    compact,
    wide,
    twoColumn,
    hero: {
      status: guidedSetup.show ? "SETUP READY" : "READY",
      lines: [
        pickByDensity({
          compact: "Local airbag for dangerous agent actions.",
          standard: "Local airbag for dangerous agent actions.",
          wide: "Local airbag between agent intent and consequential action.",
        }, density),
        guidedSetup.show
          ? pickByDensity({
              compact: "Safe local setup detected. Secure now or follow the manual path below.",
              standard: "Safe local setup detected. Secure now, or follow the manual path below.",
              wide: "Safe local setup detected: secure now, or use the manual path below: choose patch or wiring, verify the target, run a demo stop, open the proof queue, then start in observe mode.",
            }, density)
          : pickByDensity({
              compact: "Patch or wire the client, then prove one stop.",
              standard: "Patch or wire the client, prove one stop, then keep the defended record.",
              wide: "Patch or wire the client, prove one stop, keep the defended record, then decide when to observe or serve real traffic.",
            }, density),
      ],
    },
    sections,
    guidedSetup,
    footer: compact
      ? [guidedSetup.show ? "f first stop · p patch · o observe · v records" : "f first stop · p patch · o observe · v records"]
      : [],
  };
}

export function renderSentryWelcome(options = {}) {
  const view = buildWelcomeView(options);

  if (view.guard) {
    return renderSurface({
      hero: renderHero(view.hero),
      sections: [
        {
          label: view.guard.title,
          lines: view.guard.lines,
          options: { tone: "critical" },
        },
      ],
      footer: view.footer,
    });
  }

  return renderSurface({
    hero: renderHero(view.hero),
    sections: (view.sections || []).map((section) => ({
      label: section.label,
      lines: (section.entries || []).flatMap((entry, index) => ([
        ...(index ? [""] : []),
        ...renderEntryLines(entry),
      ])),
    })),
    footer: view.footer,
  });
}
