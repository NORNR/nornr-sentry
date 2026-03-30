import {
  defaultProtectPresetForShield,
  demoForProtectPreset,
  protectPresetLabel,
  protectPresetSummary,
  supportedProtectPresets,
} from "../mandates/defaults.js";
import { buildGuidedSetupArgv, buildObserveFirstArgv, inspectGuidedSetup } from "./first-run.js";
import { pickByDensity, renderHero, renderSurface, terminalDensityFlags } from "./terminal-theme.js";

function normalizeShield(value = "") {
  return String(value || "cursor").trim() || "cursor";
}

function normalizeProtectPresetForOptions(options = {}) {
  return String(options.protectPreset || defaultProtectPresetForShield(options.shield)).trim() || defaultProtectPresetForShield(options.shield);
}

function clientLabelFor(shield = "cursor") {
  if (shield === "claude-desktop") return "Claude Desktop";
  if (shield === "generic-mcp") return "Generic MCP";
  if (shield === "windsurf") return "Windsurf";
  return "Cursor";
}

function commandLine(argv = []) {
  return `nornr-sentry ${argv.join(" ")}`.trim();
}

function mandateInitArgv(options = {}, preset = "") {
  const shield = normalizeShield(options.shield);
  const argv = ["--client", shield, "--mandate-init", "--apply"];
  if (preset) argv.push("--protect", preset);
  if (options.projectRoot) argv.push("--project-root", String(options.projectRoot));
  return argv;
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

function buildProtectPresetEntry(shield = "cursor", preset = "repo", options = {}) {
  const label = protectPresetLabel(preset);
  return {
    label,
    argv: ["--client", shield, "--first-stop", "--protect", preset],
    commandLines: [commandLine(["--client", shield, "--first-stop", "--protect", preset])],
    detailLines: [protectPresetSummary(preset)],
  };
}

export function buildProtectPresetCatalog(options = {}) {
  const shield = normalizeShield(options.shield);
  const activePreset = normalizeProtectPresetForOptions(options);
  return {
    kind: "nornr.sentry.protect_presets.v1",
    shield,
    activePreset,
    entries: supportedProtectPresets().map((preset) => ({
      ...buildProtectPresetEntry(shield, preset, options),
      label: preset === activePreset ? `${protectPresetLabel(preset)} · active` : protectPresetLabel(preset),
    })),
  };
}

export function buildProtectPresetCatalogView(catalog = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.protect_presets_surface.v1",
    columns,
    density,
    twoColumn: !compact,
    interactiveEntries: true,
    initialSelectionSectionLabel: "Protect presets",
    hero: {
      status: "PROTECT PRESETS",
      lines: [
        `${clientLabelFor(catalog.shield)} · ${protectPresetLabel(catalog.activePreset || "repo")}`,
        pickByDensity({
          compact: "Choose the first thing you want the local airbag to protect.",
          standard: "Choose the first thing you want the local airbag to protect before patching, proving the stop, and serving real traffic.",
          wide: "Choose the first thing you want the local airbag to protect before patching, proving the stop, and turning the first block into a defended record.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Protect presets",
        entries: catalog.entries || [],
      },
      {
        label: "How to use this",
        lines: [
          "Pick one preset first. Then run the first-stop flow for that lane.",
          compact
            ? "Repo is the default wedge."
            : "Repo is the default wedge for most users. Secrets, production, spend, and outbound become the next obvious local protection stories.",
        ],
      },
    ],
    footer: compact ? [] : ["Use presets to translate raw action classes into one obvious user promise."],
  };
}

export function renderProtectPresetCatalog(catalog = {}) {
  const view = buildProtectPresetCatalogView(catalog);
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

export function buildFirstStopGuide(options = {}) {
  const shield = normalizeShield(options.shield);
  const preset = normalizeProtectPresetForOptions(options);
  const setup = inspectGuidedSetup({ ...options, shield, protectPreset: preset });
  const demo = demoForProtectPreset(preset);
  const firstStopArgv = ["--client", shield, "--first-stop", "--protect", preset];
  const guidedArgv = buildGuidedSetupArgv({ ...options, shield, protectPreset: preset }, setup);
  const verifyArgv = ["generic-mcp", "windsurf"].includes(shield)
    ? ["--patch-guide", shield]
    : ["--client", shield, "--verify-patch"];
  const demoArgv = ["--client", shield, "--demo", demo, "--protect", preset];
  const recordsArgv = ["--client", shield, "--records", "--records-filter", "blocked"];
  const observeArgv = buildObserveFirstArgv({ ...options, shield, protectPreset: preset });
  const serveNowArgv = serveArgv({ ...options, shield, protectPreset: preset });
  const mandateArgv = mandateInitArgv({ ...options, shield }, preset);
  return {
    kind: "nornr.sentry.first_stop.v1",
    shield,
    preset,
    demo,
    steps: [
      {
        label: `Choose ${protectPresetLabel(preset)}`,
        argv: ["--client", shield, "--protect-presets", "--protect", preset],
        commandLines: [commandLine(firstStopArgv)],
        detailLines: [protectPresetSummary(preset)],
      },
      {
        label: setup.patch?.serverPatched ? "Run guided setup · already patched" : "Run guided setup",
        argv: guidedArgv,
        commandLines: [commandLine(guidedArgv)],
        detailLines: [setup.patch?.serverPatched ? `${clientLabelFor(shield)} already points at NORNR Sentry. Guided setup mainly confirms mandate + observe-first posture.` : "Patch or wire the client, write the local mandate, then start in safe observe mode."],
      },
      {
        label: "Verify target",
        argv: verifyArgv,
        commandLines: [commandLine(verifyArgv)],
        detailLines: [["generic-mcp", "windsurf"].includes(shield) ? `Review the manual ${clientLabelFor(shield)} wiring path before the first real request.` : `Confirm that ${clientLabelFor(shield)} now contains the NORNR Sentry stanza.`].filter(Boolean),
      },
      {
        label: setup.mandate?.exists ? `Apply ${protectPresetLabel(preset)} mandate · already present` : `Apply ${protectPresetLabel(preset)} mandate`,
        argv: mandateArgv,
        commandLines: [commandLine(mandateArgv)],
        detailLines: [setup.mandate?.exists ? "A local mandate already exists here. Re-apply only if you want the preset to become the active opinionated default." : "Make the local boundary opinionated before the first real stop."],
      },
      {
        label: "Run first stop",
        argv: demoArgv,
        commandLines: [commandLine(demoArgv)],
        detailLines: ["Trigger one obvious dangerous lane and prove that the local boundary really intervenes."],
      },
      {
        label: "Open proof queue",
        argv: recordsArgv,
        commandLines: [commandLine(recordsArgv)],
        detailLines: ["Open the defended records queue right after the stop and inspect the first real proof object."],
      },
      {
        label: "Observe first",
        argv: observeArgv,
        commandLines: [commandLine(observeArgv)],
        detailLines: ["Stay in shadow mode first so the lane stays visible before harder enforcement."],
      },
      {
        label: "Serve for real",
        argv: serveNowArgv,
        commandLines: [commandLine(serveNowArgv)],
        detailLines: ["Turn on the live local boundary once the first stop and proof queue look right."],
      },
    ],
    readinessLines: [
      `Client target: ${clientLabelFor(shield)}`,
      setup.patch?.serverPatched
        ? "Patch status: local boundary already wired into the client path."
        : setup.patch?.canPatch
          ? "Patch status: ready to patch from this machine."
          : `Patch status: manual ${clientLabelFor(shield)} wiring path.`,
      setup.mandate?.exists
        ? "Mandate status: local mandate already exists."
        : "Mandate status: first local mandate will be written during setup.",
      "Observe-first safety: shadow mode is observe-only, so you can watch the lane before enforcing it.",
    ],
  };
}

export function buildFirstStopGuideView(guide = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.first_stop_surface.v1",
    columns,
    density,
    twoColumn: !compact,
    interactiveEntries: true,
    initialSelectionSectionLabel: "First stop path",
    hero: {
      status: "FIRST STOP",
      lines: [
        `${clientLabelFor(guide.shield)} · ${protectPresetLabel(guide.preset)} · ${guide.steps?.length || 0}-step path`,
        pickByDensity({
          compact: "Install, prove one stop, then open the first defended record.",
          standard: "Install, prove one stop, then open the first defended record before you try to scale the product any further.",
          wide: "Install, prove one stop, then open the first defended record before you try to scale the product any further. This is the shortest path from wedge to proof object.",
        }, density),
      ],
    },
    sections: [
      {
        label: "First stop path",
        entries: guide.steps || [],
      },
      {
        label: "Readiness now",
        lines: guide.readinessLines || [],
      },
      {
        label: "Why this matters",
        lines: [
          `Preset focus: ${protectPresetLabel(guide.preset)}`,
          `Demo lane: ${guide.demo}`,
          compact
            ? "Stop first. Proof second. Scale later."
            : "Stop first. Proof second. Scale later. If the first stop is weak, everything layered above it becomes demo theater.",
        ],
      },
    ],
    footer: compact ? [] : ["The adoption wedge is not the policy menu. It is the first stop plus the first defended record."],
  };
}

export function renderFirstStopGuide(guide = {}) {
  const view = buildFirstStopGuideView(guide);
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

export function buildClientPaths(options = {}) {
  const shield = normalizeShield(options.shield);
  return {
    kind: "nornr.sentry.client_paths.v1",
    shield,
    entries: [
      {
        label: "Cursor desktop patch",
        argv: ["--client", "cursor", "--golden-path", "--protect", "repo"],
        commandLines: [commandLine(["--client", "cursor", "--golden-path", "--protect", "repo"])],
        detailLines: ["Fastest local wedge for repo protection and the first stop-screen."],
      },
      {
        label: "Claude Desktop patch",
        argv: ["--client", "claude-desktop", "--golden-path", "--protect", "secrets"],
        commandLines: [commandLine(["--client", "claude-desktop", "--golden-path", "--protect", "secrets"])],
        detailLines: ["Strong path when the first fear is secrets leaving the machine."],
      },
      {
        label: "Windsurf MCP path",
        argv: ["--patch-guide", "windsurf"],
        commandLines: [commandLine(["--patch-guide", "windsurf"])],
        detailLines: ["Manual MCP/wiring path for Windsurf without pretending there is a built-in desktop patch."],
      },
      {
        label: "OpenAI / Codex wiring",
        argv: ["--patch-guide", "openai-codex"],
        commandLines: [commandLine(["--patch-guide", "openai-codex"])],
        detailLines: ["Provider wiring path instead of a desktop config patch."],
      },
      {
        label: "Generic MCP",
        argv: ["--patch-guide", "generic-mcp"],
        commandLines: [commandLine(["--patch-guide", "generic-mcp"])],
        detailLines: ["Manual MCP config path for hosts outside Cursor and Claude Desktop."],
      },
    ],
  };
}

export function buildClientPathsView(paths = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.client_paths_surface.v1",
    columns,
    density,
    twoColumn: !compact,
    interactiveEntries: true,
    initialSelectionSectionLabel: "Client paths",
    hero: {
      status: "CLIENT PATHS",
      lines: [
        "Choose the real install path first.",
        pickByDensity({
          compact: "Desktop patch where possible. Wiring where necessary.",
          standard: "Desktop patch where possible. Wiring where necessary. Do not pretend every client path is the same.",
          wide: "Desktop patch where possible. Wiring where necessary. The product should tell the truth about the install path instead of hiding it behind one fake button.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Client paths",
        entries: paths.entries || [],
      },
      {
        label: "What grows distribution",
        lines: [
          "Cursor and Claude Desktop are the easiest proof paths.",
          "Windsurf, OpenAI / Codex, and Generic MCP widen the top of funnel beyond one desktop patch story.",
        ],
      },
    ],
    footer: compact ? [] : ["Many users arrive through one client, but growth comes from owning the whole local install surface."],
  };
}

export function renderClientPaths(paths = {}) {
  const view = buildClientPathsView(paths);
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

export function buildScalePath(options = {}) {
  const publicSurface = Boolean(options.publicSurface);
  return {
    kind: "nornr.sentry.scale_path.v1",
    publicSurface,
    personalEntries: [
      {
        label: "Perfect first stop",
        argv: ["--client", normalizeShield(options.shield), "--first-stop", "--protect", normalizeProtectPresetForOptions(options)],
        commandLines: [commandLine(["--client", normalizeShield(options.shield), "--first-stop", "--protect", normalizeProtectPresetForOptions(options)])],
        detailLines: ["Get install, first stop, and first defended record working before you add more layers."],
      },
      {
        label: "Protect presets",
        argv: ["--client", normalizeShield(options.shield), "--protect-presets"],
        commandLines: [commandLine(["--client", normalizeShield(options.shield), "--protect-presets"])],
        detailLines: ["Turn raw action classes into one obvious user promise."],
      },
      {
        label: "Client paths",
        argv: ["--client", normalizeShield(options.shield), "--client-paths"],
        commandLines: [commandLine(["--client", normalizeShield(options.shield), "--client-paths"])],
        detailLines: ["Expand distribution by owning desktop patch and wiring paths honestly."],
      },
    ],
    teamEntries: publicSurface
      ? []
      : [
        {
          label: "Team trust panel",
          argv: ["--team-trust-panel"],
          commandLines: [commandLine(["--team-trust-panel"])],
          detailLines: ["Move from one operator to one team mandate loop."],
        },
        {
          label: "Human decision inbox",
          argv: ["--human-decision-inbox"],
          commandLines: [commandLine(["--human-decision-inbox"])],
          detailLines: ["Move from one local stop to shared review and decision flow."],
        },
      ],
    fleetEntries: publicSurface
      ? []
      : [
        {
          label: "Hosted sync panel",
          argv: ["--hosted-sync-panel"],
          commandLines: [commandLine(["--hosted-sync-panel"])],
          detailLines: ["Move from one local tool to repeatable hosted sync and operational lanes."],
        },
        {
          label: "Fleet compliance panel",
          argv: ["--fleet-compliance-panel"],
          commandLines: [commandLine(["--fleet-compliance-panel"])],
          detailLines: ["Move from one operator artifact to fleet posture and remediation."],
        },
      ],
  };
}

export function buildScalePathView(scale = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.scale_path_surface.v1",
    columns,
    density,
    twoColumn: !compact,
    interactiveEntries: true,
    initialSelectionSectionLabel: "Personal now",
    hero: {
      status: "SCALE PATH",
      lines: [
        "Build the wedge first, then add the layers on top.",
        pickByDensity({
          compact: "Personal wedge first. Team and fleet later.",
          standard: "Personal wedge first. Team and fleet later. If the first stop is weak, the platform layers above it do not save distribution.",
          wide: "Personal wedge first. Team and fleet later. If the first stop is weak, the platform layers above it do not save distribution — they just make the product heavier.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Personal now",
        entries: scale.personalEntries || [],
      },
      {
        label: "Team next",
        ...(scale.teamEntries?.length
          ? { entries: scale.teamEntries }
          : { lines: ["Shared review, team mandate loops, and org trust surfaces stay behind the core public wedge for now."] }),
      },
      {
        label: "Fleet later",
        ...(scale.fleetEntries?.length
          ? { entries: scale.fleetEntries }
          : { lines: ["Hosted sync, fleet compliance, and broader governance stay behind the core public wedge for now."] }),
      },
    ],
    footer: compact ? [] : ["Growth comes from the personal wedge. Team and fleet layers should amplify it, not replace it."],
  };
}

export function renderScalePath(scale = {}) {
  const view = buildScalePathView(scale);
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
