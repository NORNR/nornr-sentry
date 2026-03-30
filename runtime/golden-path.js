import { renderHero, renderSurface } from "./terminal-theme.js";
import { defaultProtectPresetForShield, demoForProtectPreset, protectPresetLabel } from "../mandates/defaults.js";
import { buildGuidedSetupArgv, buildObserveFirstArgv } from "./first-run.js";

function normalizeShield(value = "") {
  return String(value || "cursor").trim() || "cursor";
}

function clientLabelFor(shield = "cursor") {
  if (shield === "claude-desktop") return "Claude Desktop";
  if (shield === "generic-mcp") return "Generic MCP";
  return "Cursor";
}

function presetForOptions(options = {}) {
  return String(options.protectPreset || defaultProtectPresetForShield(options.shield)).trim() || defaultProtectPresetForShield(options.shield);
}

function introForShield(shield = "cursor", options = {}) {
  const presetLabel = protectPresetLabel(presetForOptions({ ...options, shield }));
  if (shield === "claude-desktop") return `Patch Claude Desktop first, prove one ${presetLabel.toLowerCase()} stop, then observe before serving real traffic.`;
  if (shield === "generic-mcp") return `Wire one MCP lane, prove one ${presetLabel.toLowerCase()} stop, then observe before serving real traffic.`;
  return `Patch Cursor first, prove one ${presetLabel.toLowerCase()} stop, then observe before serving real traffic.`;
}

function commandLine(argv = []) {
  return `nornr-sentry ${argv.join(" ")}`.trim();
}

function serveArgv(options = {}, overrides = {}) {
  const shield = normalizeShield(overrides.shield || options.shield);
  const port = Number(overrides.port || options.port || 4317) || 4317;
  const argv = ["--client", shield, "--serve", "--port", String(port)];
  if (overrides.shadowMode) argv.push("--shadow-mode");
  if (overrides.noUpstream) argv.push("--no-upstream");
  if (overrides.ambientTrust) argv.push("--ambient-trust");
  if (overrides.verbose) argv.push("--verbose");
  return argv;
}

function observeFirstArgv(options = {}) {
  return buildObserveFirstArgv(options);
}

function detailsForStep(step = {}, compact = false) {
  return [
    ...((step.commandLines || []).map((line) => line)),
    ...(!compact ? (step.detailLines || []) : []),
  ];
}

export function buildGoldenPathStepEntries(options = {}) {
  const shield = normalizeShield(options.shield);
  const clientLabel = clientLabelFor(shield);
  const preset = presetForOptions({ ...options, shield });
  const demo = demoForProtectPreset(preset);
  const port = Number(options.port || 4317) || 4317;
  const observeArgv = observeFirstArgv({ ...options, shield, port, protectPreset: preset });
  const serveNowArgv = serveArgv({ ...options, shield, port, protectPreset: preset });
  const guidedSetupArgv = buildGuidedSetupArgv({ ...options, shield, port, protectPreset: preset });
  return [
    {
      label: `Choose ${protectPresetLabel(preset)}`,
      argv: ["--client", shield, "--protect-presets", "--protect", preset],
      commandLines: [commandLine(["--client", shield, "--protect-presets", "--protect", preset])],
      detailLines: ["Choose the first thing you want the local airbag to protect."],
    },
    {
      label: `Setup ${clientLabel}`,
      argv: guidedSetupArgv,
      commandLines: [commandLine(guidedSetupArgv)],
      detailLines: [`Patch or wire ${clientLabel}, write the local mandate, and start safely in observe mode.`],
    },
    {
      label: `Verify ${clientLabel}`,
      argv: shield === "generic-mcp" ? ["--patch-guide", "generic-mcp"] : ["--client", shield, "--verify-patch"],
      commandLines: [commandLine(shield === "generic-mcp" ? ["--patch-guide", "generic-mcp"] : ["--client", shield, "--verify-patch"])],
      detailLines: [shield === "generic-mcp" ? "Review the manual MCP wiring path before the first real request." : `Confirm that ${clientLabel} now contains the NORNR Sentry stanza.`],
    },
    {
      label: "Run demo stop",
      argv: ["--client", shield, "--demo", demo, "--protect", preset],
      commandLines: [commandLine(["--client", shield, "--demo", demo, "--protect", preset])],
      detailLines: ["Trigger one obvious dangerous lane and see the stop-screen immediately."],
    },
    {
      label: "Open proof queue",
      argv: ["--client", shield, "--records", "--records-filter", "blocked"],
      commandLines: [commandLine(["--client", shield, "--records", "--records-filter", "blocked"])],
      detailLines: ["Open the defended record queue and inspect the first real proof object."],
    },
    {
      label: "Observe first",
      argv: observeArgv,
      commandLines: [commandLine(observeArgv)],
      detailLines: ["Start in shadow mode first so the lane is visible before enforcement."],
    },
    {
      label: "Serve for real",
      argv: serveNowArgv,
      commandLines: [commandLine(serveNowArgv)],
      detailLines: ["Turn on the live local boundary once patching, proof queue, and observe mode look right."],
    },
  ];
}

export function buildGoldenPathClientEntry(shield = "cursor", options = {}) {
  const normalizedShield = normalizeShield(shield);
  const steps = buildGoldenPathStepEntries({ ...options, shield: normalizedShield });
  return {
    label: `${clientLabelFor(normalizedShield)} golden path`,
    argv: steps[0]?.argv || ["--client", normalizedShield, "--first-stop"],
    commandLines: steps.flatMap((step) => step.commandLines || []),
    detailLines: [introForShield(normalizedShield)],
  };
}

export function buildGoldenPathWizard(options = {}) {
  const shield = normalizeShield(options.shield);
  const clientLabel = clientLabelFor(shield);
  const steps = buildGoldenPathStepEntries(options);
  return {
    kind: "nornr.sentry.golden_path.v1",
    shield,
    clientLabel,
    summary: introForShield(shield, options),
    steps,
  };
}

export function buildGoldenPathWizardView(wizard = {}, explicitColumns = 80) {
  const columns = Number(explicitColumns || 0) || 80;
  const compact = columns < 92;
  return {
    kind: "nornr.sentry.golden_path_surface.v1",
    columns,
    density: compact ? "compact" : "standard",
    twoColumn: !compact,
    interactiveEntries: true,
    hero: {
      status: "GOLDEN PATH",
      lines: [
        `${wizard.clientLabel || "Client"} · ${(wizard.steps || []).length || 0}-step install path`,
        wizard.summary || "Choose one protection preset, prove one stop, open the proof queue, observe first, then serve for real.",
      ],
    },
    sections: [
      {
        label: "Walk the path",
        entries: (wizard.steps || []).map((step) => ({
          label: step.label,
          argv: step.argv,
          commandLines: step.commandLines || [],
          detailLines: step.detailLines || [],
        })),
      },
      {
        label: "What this wizard does",
        lines: [
          compact
            ? `Moves one client lane from preset to live serve in ${(wizard.steps || []).length || 0} deliberate steps.`
            : `Moves one client lane from preset to live serve in ${(wizard.steps || []).length || 0} deliberate steps so the first proof moment happens before broader rollout.`,
          "Use Enter on any step to launch it directly.",
        ],
      },
    ],
    footer: compact ? [] : ["Golden path is the adoption wedge: one client lane, one stop-screen, one defended record."],
  };
}

export function renderGoldenPathWizard(wizard = {}) {
  const view = buildGoldenPathWizardView(wizard);
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
