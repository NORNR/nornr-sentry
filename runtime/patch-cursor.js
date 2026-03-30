import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  pickByDensity,
  renderHero,
  renderSurface,
  terminalDensityFlags,
} from "./terminal-theme.js";
import { buildClientAdapter } from "../adapters/clients.js";
import { buildGoldenPathStepEntries } from "./golden-path.js";

function cursorConfigPathFor(options = {}) {
  if (options.cursorConfigPath) return path.resolve(options.cursorConfigPath);
  return path.join(os.homedir(), ".cursor", "mcp.json");
}

function claudeDesktopConfigPathFor(options = {}) {
  if (options.claudeConfigPath) return path.resolve(options.claudeConfigPath);
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

function resolvePatchTarget(shield = "cursor", options = {}) {
  if (shield === "claude-desktop") {
    return {
      filePath: claudeDesktopConfigPathFor(options),
      configLabel: "Claude Desktop config",
      clientLabel: "Claude Desktop",
    };
  }
  if (shield === "generic-mcp") {
    return {
      filePath: "",
      configLabel: "Generic MCP config",
      clientLabel: "Generic MCP",
    };
  }
  if (shield === "windsurf") {
    return {
      filePath: "",
      configLabel: "Windsurf MCP config",
      clientLabel: "Windsurf",
    };
  }
  return {
    filePath: cursorConfigPathFor(options),
    configLabel: "Cursor MCP config",
    clientLabel: "Cursor",
  };
}

async function readJsonFile(filePath) {
  try {
    const content = await fsp.readFile(filePath, "utf8");
    return {
      exists: true,
      content,
      parsed: JSON.parse(content),
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        exists: false,
        content: "",
        parsed: {},
      };
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Cursor MCP config is not valid JSON: ${filePath}`);
    }
    throw error;
  }
}

function readJsonFileSync(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return {
      exists: true,
      parsed: JSON.parse(content),
      parseError: false,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        exists: false,
        parsed: {},
        parseError: false,
      };
    }
    if (error instanceof SyntaxError) {
      return {
        exists: true,
        parsed: {},
        parseError: true,
      };
    }
    return {
      exists: false,
      parsed: {},
      parseError: false,
    };
  }
}

function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value;
}

function patchChoice(label, argv, detailLines = [], options = {}) {
  return {
    label,
    argv,
    commandLines: [`nornr-sentry ${argv.join(" ")}`.trim()],
    compactCommandLines: options.compactCommandLines || [],
    detailLines,
    compactDetailLines: options.compactDetailLines || detailLines,
    selectionKey: options.selectionKey || label,
    meta: options.meta || {},
  };
}

export function patchTargetExplicitlyRequested(argv = []) {
  const tokens = Array.isArray(argv) ? argv : [];
  return tokens.includes("--client") || tokens.includes("--shield");
}

export function patchClientExplicitlyRequested(argv = []) {
  return patchTargetExplicitlyRequested(argv);
}

export function buildPatchChooserView(options = {}, explicitColumns) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const port = Number(options.port || 4317) || 4317;
  return {
    kind: "nornr.sentry.patch_chooser_surface.v1",
    columns,
    density,
    twoColumn: columns >= 100,
    interactiveEntries: true,
    selectionFocused: columns >= 100,
    initialSelectionSectionLabel: "Patch directly",
    buildSelectionSummary: (selectedEntry) => selectedEntry
      ? {
        label: "Selected path",
        tone: "neutral",
        lines: [
          selectedEntry.label || "Selected path",
          selectedEntry.meta?.summary || selectedEntry.detailLines?.[0] || "",
          selectedEntry.meta?.preview || selectedEntry.commandLines?.[0] || "",
        ].filter(Boolean),
      }
      : null,
    hero: {
      status: "PATCH TARGET",
      lines: [
        "Choose the real install path first.",
        pickByDensity({
          compact: "Patch desktop clients directly. Use wiring for Windsurf and Codex-style paths.",
          standard: "Patch Cursor or Claude Desktop directly. Use wiring for Windsurf and OpenAI/Codex-style paths.",
          wide: "Patch desktop clients directly. Use wiring for Windsurf, OpenAI/Codex-style traffic, and generic MCP hosts.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Patch directly",
        compactEntries: true,
        entries: [
          patchChoice("Patch Cursor", ["--client", "cursor", "--patch-client"], ["Fastest desktop patch path."], {
            compactCommandLines: ["nornr-sentry --client cursor --patch-client"],
            compactDetailLines: ["Desktop patch into ~/.cursor/mcp.json."],
            selectionKey: "patch-cursor",
            meta: {
              summary: "Desktop patch path for the fastest local wedge.",
              preview: "nornr-sentry --client cursor --patch-client",
            },
          }),
          patchChoice("Patch Claude Desktop", ["--client", "claude-desktop", "--patch-client"], ["Desktop patch for Claude Desktop."], {
            compactCommandLines: ["nornr-sentry --client claude-desktop --patch-client"],
            compactDetailLines: ["Desktop patch into Claude Desktop config."],
            selectionKey: "patch-claude-desktop",
            meta: {
              summary: "Desktop patch path for Claude Desktop on this machine.",
              preview: "nornr-sentry --client claude-desktop --patch-client",
            },
          }),
        ],
      },
      {
        label: "Use wiring",
        compactEntries: true,
        entries: [
          patchChoice("Windsurf path", ["--patch-guide", "windsurf", "--port", String(port)], ["Manual MCP path for Windsurf."], {
            compactCommandLines: [`nornr-sentry --patch-guide windsurf --port ${port}`],
            compactDetailLines: ["Manual MCP path, not a desktop patch."],
            selectionKey: "patch-windsurf",
            meta: {
              summary: "Use the honest Windsurf MCP/manual path instead of pretending a desktop patch exists.",
              preview: `nornr-sentry --patch-guide windsurf --port ${port}`,
            },
          }),
          patchChoice("OpenAI / Codex path", ["--patch-guide", "openai-codex", "--port", String(port)], ["Provider wiring path."], {
            compactCommandLines: [`nornr-sentry --patch-guide openai-codex --port ${port}`],
            compactDetailLines: ["Provider/base-URL wiring, not a desktop patch."],
            selectionKey: "patch-openai-codex",
            meta: {
              summary: "Use provider wiring instead of a desktop config file patch.",
              preview: `nornr-sentry --patch-guide openai-codex --port ${port}`,
            },
          }),
          patchChoice("Generic MCP path", ["--patch-guide", "generic-mcp", "--port", String(port)], ["Manual MCP config path."], {
            compactCommandLines: [`nornr-sentry --patch-guide generic-mcp --port ${port}`],
            compactDetailLines: ["Manual MCP config path."],
            selectionKey: "patch-generic-mcp",
            meta: {
              summary: "Use the generic MCP snippet in the host instead of a built-in desktop patch.",
              preview: `nornr-sentry --patch-guide generic-mcp --port ${port}`,
            },
          }),
        ],
      },
    ],
    footer: compact ? [] : ["Choose a path here instead of silently defaulting to Cursor."],
  };
}

export function renderPatchChooser(options = {}) {
  const view = buildPatchChooserView(options);
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

export function buildVerifyChooserView(options = {}, explicitColumns) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const port = Number(options.port || 4317) || 4317;
  return {
    kind: "nornr.sentry.verify_chooser_surface.v1",
    columns,
    density,
    twoColumn: columns >= 100,
    interactiveEntries: true,
    selectionFocused: columns >= 100,
    initialSelectionSectionLabel: "Verify desktop patch",
    buildSelectionSummary: (selectedEntry) => selectedEntry
      ? {
        label: "Selected verify path",
        tone: "neutral",
        lines: [
          selectedEntry.label || "Selected verify path",
          selectedEntry.meta?.summary || selectedEntry.detailLines?.[0] || "",
          selectedEntry.meta?.preview || selectedEntry.commandLines?.[0] || "",
        ].filter(Boolean),
      }
      : null,
    hero: {
      status: "VERIFY TARGET",
      lines: [
        "Choose the real verify path first.",
        pickByDensity({
          compact: "Only Cursor and Claude Desktop have a desktop patch to verify.",
          standard: "Only Cursor and Claude Desktop have a desktop patch to verify. Windsurf and Codex-style paths use wiring instead.",
          wide: "Only Cursor and Claude Desktop have a desktop patch to verify. Windsurf, OpenAI/Codex-style, and generic MCP paths use wiring instead.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Verify desktop patch",
        compactEntries: true,
        entries: [
          patchChoice("Verify Cursor", ["--client", "cursor", "--verify-patch"], ["Inspect the Cursor patch."], {
            compactCommandLines: ["nornr-sentry --client cursor --verify-patch"],
            compactDetailLines: ["Check ~/.cursor/mcp.json for the stanza."],
            selectionKey: "verify-cursor",
            meta: {
              summary: "Inspect the local Cursor config for the NORNR Sentry stanza.",
              preview: "nornr-sentry --client cursor --verify-patch",
            },
          }),
          patchChoice("Verify Claude Desktop", ["--client", "claude-desktop", "--verify-patch"], ["Inspect the Claude Desktop patch."], {
            compactCommandLines: ["nornr-sentry --client claude-desktop --verify-patch"],
            compactDetailLines: ["Check Claude Desktop config for the stanza."],
            selectionKey: "verify-claude-desktop",
            meta: {
              summary: "Inspect the Claude Desktop config for the NORNR Sentry stanza.",
              preview: "nornr-sentry --client claude-desktop --verify-patch",
            },
          }),
        ],
      },
      {
        label: "Use wiring",
        compactEntries: true,
        entries: [
          patchChoice("Windsurf path", ["--patch-guide", "windsurf", "--port", String(port)], ["Manual MCP path."], {
            compactCommandLines: [`nornr-sentry --patch-guide windsurf --port ${port}`],
            compactDetailLines: ["No desktop patch exists for this path."],
            selectionKey: "verify-windsurf",
            meta: {
              summary: "Review the Windsurf MCP/manual path instead of looking for a desktop patch.",
              preview: `nornr-sentry --patch-guide windsurf --port ${port}`,
            },
          }),
          patchChoice("OpenAI / Codex path", ["--patch-guide", "openai-codex", "--port", String(port)], ["Provider wiring path."], {
            compactCommandLines: [`nornr-sentry --patch-guide openai-codex --port ${port}`],
            compactDetailLines: ["No desktop patch exists for this path."],
            selectionKey: "verify-openai-codex",
            meta: {
              summary: "Review provider wiring instead of expecting a desktop file patch.",
              preview: `nornr-sentry --patch-guide openai-codex --port ${port}`,
            },
          }),
          patchChoice("Generic MCP path", ["--patch-guide", "generic-mcp", "--port", String(port)], ["Manual MCP config path."], {
            compactCommandLines: [`nornr-sentry --patch-guide generic-mcp --port ${port}`],
            compactDetailLines: ["No desktop patch exists for this path."],
            selectionKey: "verify-generic-mcp",
            meta: {
              summary: "Review the generic MCP snippet in the host instead of a built-in desktop patch.",
              preview: `nornr-sentry --patch-guide generic-mcp --port ${port}`,
            },
          }),
        ],
      },
    ],
    footer: compact ? [] : ["Verify now chooses the real target instead of assuming one client."],
  };
}

export function renderVerifyChooser(options = {}) {
  const view = buildVerifyChooserView(options);
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

export function buildPatchGuideView(target = "openai-codex", options = {}, explicitColumns) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const normalizedTarget = String(target || "openai-codex").trim() || "openai-codex";
  const port = Number(options.port || 4317) || 4317;
  const openaiAdapter = buildClientAdapter("cursor", { ...options, port });
  const genericAdapter = buildClientAdapter("generic-mcp", { ...options, port });
  const windsurfAdapter = buildClientAdapter("windsurf", { ...options, port });
  if (normalizedTarget === "generic-mcp") {
    return {
      kind: "nornr.sentry.patch_guide_surface.v1",
      columns,
      density,
      twoColumn: false,
      interactiveEntries: true,
      hero: {
        status: "MANUAL MCP PATH",
        lines: [
          "Generic MCP does not get a built-in desktop patch.",
          pickByDensity({
            compact: "Use the config snippet below in your MCP host.",
            standard: "Use the generic MCP config snippet below in your MCP host instead of expecting a Cursor-style patch.",
            wide: "Use the generic MCP config snippet below in your MCP host instead of expecting a built-in Cursor or Claude Desktop style patch.",
          }, density),
        ],
      },
      sections: [
        {
          label: "Manual config",
          lines: genericAdapter.configSnippet.split("\n"),
        },
        {
          label: "Next path",
          entries: [
            patchChoice("Run demo stop", ["--client", "generic-mcp", "--demo", "production_mutation"], ["Prove the stop before broader rollout."]),
            patchChoice("Observe first", ["--client", "generic-mcp", "--serve", "--port", String(port), "--shadow-mode", "--no-upstream"], ["Start in shadow mode once the MCP host points at NORNR Sentry."]),
          ],
        },
      ],
      footer: compact ? [] : ["Generic MCP is a manual wiring path, not a built-in desktop patch target."],
    };
  }
  if (normalizedTarget === "windsurf") {
    return {
      kind: "nornr.sentry.patch_guide_surface.v1",
      columns,
      density,
      twoColumn: false,
      interactiveEntries: true,
      hero: {
        status: "WINDSURF PATH",
        lines: [
          "Windsurf uses a manual MCP/wiring path today.",
          pickByDensity({
            compact: "Use the MCP snippet below in Windsurf.",
            standard: "Use the MCP snippet below in Windsurf instead of expecting a Cursor-style desktop patch.",
            wide: "Use the MCP snippet below in Windsurf instead of expecting a built-in desktop patch. This keeps the install story honest while still giving Windsurf users a real wedge path.",
          }, density),
        ],
      },
      sections: [
        {
          label: "Manual config",
          lines: windsurfAdapter.configSnippet.split("\n"),
        },
        {
          label: "Next path",
          entries: [
            patchChoice("Run demo stop", ["--client", "windsurf", "--demo", "destructive_shell"], ["Prove the stop before serving real Windsurf traffic."]),
            patchChoice("Observe first", ["--client", "windsurf", "--serve", "--port", String(port), "--shadow-mode", "--no-upstream"], ["Start in shadow mode first so Windsurf can be observed before enforcement."]),
            patchChoice("Perfect first stop", ["--client", "windsurf", "--first-stop", "--protect", "repo"], ["Run the shortest wedge-to-proof path for Windsurf."]),
          ],
        },
      ],
      footer: compact ? [] : ["Windsurf is supported as an honest MCP/manual path today, not as a fake built-in desktop patch target."],
    };
  }
  return {
    kind: "nornr.sentry.patch_guide_surface.v1",
    columns,
    density,
    twoColumn: false,
    interactiveEntries: true,
    hero: {
      status: "PROVIDER WIRING",
      lines: [
        "OpenAI / Codex-style traffic uses provider wiring instead of a desktop patch.",
        pickByDensity({
          compact: "Point the provider base URL at NORNR Sentry first.",
          standard: "Point the provider base URL at NORNR Sentry first, then relay safe calls upstream.",
          wide: "Point the provider base URL at NORNR Sentry first, then relay safe calls upstream instead of expecting a desktop client config patch.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Provider env",
        lines: String(openaiAdapter.providerSnippets?.openai || "").split("\n"),
      },
      {
        label: "Next path",
        entries: [
          patchChoice("Observe first", ["--client", "cursor", "--serve", "--port", String(port), "--shadow-mode", "--no-upstream"], ["Start with the local boundary in shadow mode first."]),
          patchChoice("Run demo stop", ["--client", "cursor", "--demo", "destructive_shell"], ["Prove the stop before serving real provider traffic."]),
        ],
      },
    ],
    footer: compact ? [] : ["Codex / OpenAI-style traffic is a wiring path, not a Cursor or Claude Desktop file patch."],
  };
}

export function renderPatchGuide(target = "openai-codex", options = {}) {
  const view = buildPatchGuideView(target, options);
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

export function inspectClientPatchTarget(shield = "cursor", options = {}) {
  const normalizedShield = String(shield || "").trim() || "cursor";
  const target = resolvePatchTarget(normalizedShield, options);
  const patchSupported = ["cursor", "claude-desktop"].includes(normalizedShield);
  if (!patchSupported) {
    return {
      ...target,
      patchSupported,
      fileExists: false,
      parentExists: false,
      clientDetected: false,
      serverPatched: false,
      parseError: false,
    };
  }
  const parentDir = path.dirname(target.filePath);
  const parentExists = fs.existsSync(parentDir);
  const snapshot = readJsonFileSync(target.filePath);
  const mcpServers = snapshot.parsed && typeof snapshot.parsed === "object" && !Array.isArray(snapshot.parsed)
    ? snapshot.parsed.mcpServers
    : null;
  const serverPatched = Boolean(mcpServers && typeof mcpServers === "object" && !Array.isArray(mcpServers) && mcpServers["nornr-sentry"]);

  return {
    ...target,
    patchSupported,
    fileExists: snapshot.exists,
    parentExists,
    clientDetected: snapshot.exists || parentExists,
    serverPatched,
    parseError: snapshot.parseError,
  };
}

export async function patchClientConfig(adapter, options = {}) {
  if (!adapter?.configSnippet) {
    throw new Error("Client patch requires a valid adapter config snippet.");
  }

  const shield = String(options.shield || adapter?.shield || "cursor").trim() || "cursor";
  if (!["cursor", "claude-desktop"].includes(shield)) {
    throw new Error(`Patch is only supported for Cursor or Claude Desktop, not "${shield}".`);
  }
  const target = resolvePatchTarget(shield, options);
  const filePath = target.filePath;
  const existing = await readJsonFile(filePath);
  const nextConfig = existing.exists ? ensureObject(existing.parsed, target.configLabel) : {};
  const adapterConfig = ensureObject(JSON.parse(adapter.configSnippet), `NORNR Sentry ${target.clientLabel} config`);
  const nextServers = ensureObject(nextConfig.mcpServers ?? {}, `${target.clientLabel} mcpServers`);
  const patchServer = ensureObject(adapterConfig.mcpServers?.["nornr-sentry"] ?? {}, "NORNR Sentry server stanza");

  nextConfig.mcpServers = {
    ...nextServers,
    "nornr-sentry": patchServer,
  };

  await fsp.mkdir(path.dirname(filePath), { recursive: true });

  let backupPath = "";
  if (existing.exists) {
    backupPath = `${filePath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await fsp.writeFile(backupPath, existing.content, "utf8");
  }

  await fsp.writeFile(filePath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return {
    ok: true,
    shield,
    filePath,
    backupPath,
    created: !existing.exists,
    serverName: "nornr-sentry",
    configLabel: target.configLabel,
    clientLabel: target.clientLabel,
  };
}

export async function patchCursorConfig(adapter, options = {}) {
  return patchClientConfig(adapter, {
    ...options,
    shield: "cursor",
  });
}

export function buildPatchInspectView(result = {}, explicitColumns) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const shield = String(result?.shield || "cursor").trim() || "cursor";
  const nextSteps = result.serverPatched
    ? buildGoldenPathStepEntries({ shield }).slice(2)
    : buildGoldenPathStepEntries({ shield }).slice(0, 2);
  return {
    kind: "nornr.sentry.patch_inspect_surface.v1",
    columns,
    density,
    twoColumn: false,
    interactiveEntries: true,
    hero: {
      status: result.serverPatched ? "PATCH VERIFIED" : "PATCH CHECK",
      lines: [
        `Client ${result.clientLabel || "Cursor"} | ${result.serverPatched ? "Patched" : "Not patched yet"}`,
        pickByDensity({
          compact: result.serverPatched ? "Local boundary stanza found." : "Local boundary stanza not found yet.",
          standard: result.serverPatched ? `NORNR Sentry stanza is present in ${result.configLabel || "client config"}.` : `NORNR Sentry stanza is not present in ${result.configLabel || "client config"} yet.`,
          wide: result.serverPatched ? `NORNR Sentry stanza is present in ${result.configLabel || "client config"}.` : `NORNR Sentry stanza is not present in ${result.configLabel || "client config"} yet.`,
        }, density),
      ],
    },
    sections: [
      {
        label: "Client config",
        lines: [
          `Target: ${result.filePath}`,
          `Config exists: ${result.fileExists ? "yes" : "no"}`,
          `Parent folder exists: ${result.parentExists ? "yes" : "no"}`,
          `Patched now: ${result.serverPatched ? "yes" : "no"}`,
          ...(result.parseError ? ["Config JSON could not be parsed."] : []),
        ],
      },
      {
        label: result.serverPatched ? "Next path" : "Fix next",
        entries: nextSteps,
      },
    ],
    footer: compact ? [] : [result.serverPatched ? "Patch verify passed. Restart the client if needed, then continue the golden path." : "Patch verify did not find the local boundary stanza yet."],
  };
}

export function renderPatchInspect(result = {}) {
  const view = buildPatchInspectView(result);
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

export function buildPatchSummaryView(result, explicitColumns) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  const shield = String(result?.shield || (String(result?.clientLabel || "").toLowerCase().includes("claude") ? "claude-desktop" : "cursor")).trim() || "cursor";
  const nextSteps = buildGoldenPathStepEntries({ shield }).slice(2);
  return {
    kind: "nornr.sentry.patch_summary_surface.v1",
    columns,
    density,
    twoColumn: false,
    hero: {
      status: "PATCH APPLIED",
      lines: [
        `Client ${(result.clientLabel || "Cursor")} | Server ${result.serverName}`,
        pickByDensity({
          compact: result.created ? "Created new client config." : "Updated existing client config.",
          standard: result.created ? `Created new ${result.configLabel || "client config"}.` : `Updated existing ${result.configLabel || "client config"}.`,
          wide: result.created ? `Created new ${result.configLabel || "client config"}.` : `Updated existing ${result.configLabel || "client config"}.`,
        }, density),
      ],
    },
    sections: [
      {
        label: "Patch target",
        lines: [
          `Target: ${result.filePath}`,
          ...(!compact ? [result.backupPath ? `Backup: ${result.backupPath}` : "Backup: not needed"] : []),
        ],
      },
      {
        label: "Golden path next",
        entries: nextSteps,
      },
    ],
    interactiveEntries: true,
    footer: [
      pickByDensity({
        compact: `Next step: restart ${result.clientLabel || "the client"}.`,
        standard: `Next step: restart ${result.clientLabel || "the client"} so the local policy boundary loads.`,
        wide: `Next step: restart ${result.clientLabel || "the client"} so the local policy boundary loads.`,
      }, density),
    ],
  };
}

export function renderPatchSummary(result) {
  const view = buildPatchSummaryView(result);
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

export function renderCursorPatchSummary(result) {
  return renderPatchSummary(result);
}
