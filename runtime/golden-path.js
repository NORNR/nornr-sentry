import { renderHero, renderSurface } from "./terminal-theme.js";

function normalizeShield(value = "") {
  return String(value || "cursor").trim() || "cursor";
}

function clientLabelFor(shield = "cursor") {
  if (shield === "claude-desktop") return "Claude Desktop";
  if (shield === "generic-mcp") return "Generic MCP";
  return "Cursor";
}

function demoForShield(shield = "cursor") {
  if (shield === "claude-desktop") return "credential_exfiltration";
  if (shield === "generic-mcp") return "production_mutation";
  return "destructive_shell";
}

function introForShield(shield = "cursor") {
  if (shield === "claude-desktop") return "Patch Claude Desktop first, trigger one obvious stop, then observe before serving real traffic.";
  if (shield === "generic-mcp") return "Patch one MCP lane, prove the stop, then observe before serving real traffic.";
  return "Patch Cursor first, trigger one obvious stop, then observe before serving real traffic.";
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
  return serveArgv(options, {
    ...options,
    shadowMode: true,
    noUpstream: true,
  });
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
  const demo = demoForShield(shield);
  const port = Number(options.port || 4317) || 4317;
  const observeArgv = observeFirstArgv({ ...options, shield, port });
  const serveNowArgv = serveArgv({ ...options, shield, port });
  return [
    {
      label: `Patch ${clientLabel}`,
      argv: ["--client", shield, "--patch-client"],
      commandLines: [commandLine(["--client", shield, "--patch-client"])],
      detailLines: [`Patch ${clientLabel} into the local boundary first.`],
    },
    {
      label: `Verify ${clientLabel} patch`,
      argv: ["--client", shield, "--verify-patch"],
      commandLines: [commandLine(["--client", shield, "--verify-patch"])],
      detailLines: [`Confirm that ${clientLabel} now contains the NORNR Sentry stanza.`],
    },
    {
      label: "Run demo stop",
      argv: ["--client", shield, "--demo", demo],
      commandLines: [commandLine(["--client", shield, "--demo", demo])],
      detailLines: ["Trigger one obvious dangerous lane and see the stop-screen immediately."],
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
      detailLines: ["Turn on the live local boundary once patching and observe mode look right."],
    },
  ];
}

export function buildGoldenPathClientEntry(shield = "cursor", options = {}) {
  const normalizedShield = normalizeShield(shield);
  const steps = buildGoldenPathStepEntries({ ...options, shield: normalizedShield });
  return {
    label: `${clientLabelFor(normalizedShield)} golden path`,
    argv: steps[0]?.argv || ["--client", normalizedShield, "--patch-client"],
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
    summary: introForShield(shield),
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
        `${wizard.clientLabel || "Client"} · 5-step install path`,
        wizard.summary || "Patch the client, prove one stop, observe first, then serve for real.",
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
            ? "Moves one client lane from patch to live serve in five deliberate steps."
            : "Moves one client lane from patch to live serve in five deliberate steps so the first proof moment happens before broader rollout.",
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
