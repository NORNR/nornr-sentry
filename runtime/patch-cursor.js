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

function patchChoice(label, argv, detailLines = []) {
  return {
    label,
    argv,
    commandLines: [`nornr-sentry ${argv.join(" ")}`.trim()],
    detailLines,
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
    twoColumn: false,
    interactiveEntries: true,
    hero: {
      status: "PATCH TARGET",
      lines: [
        "Choose the client or wiring path first.",
        pickByDensity({
          compact: "Cursor and Claude Desktop patch directly. Windsurf/Codex use wiring instead.",
          standard: "Cursor and Claude Desktop patch directly. Windsurf and OpenAI/Codex-style traffic use wiring instead of a desktop config patch.",
          wide: "Choose the exact patch target first: Cursor and Claude Desktop patch directly, while Windsurf and OpenAI/Codex-style traffic use wiring instead of a desktop config file patch.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Patchable clients",
        entries: [
          patchChoice("Patch Cursor", ["--client", "cursor", "--patch-client"], ["Write the NORNR Sentry stanza into ~/.cursor/mcp.json."]),
          patchChoice("Patch Claude Desktop", ["--client", "claude-desktop", "--patch-client"], ["Write the NORNR Sentry stanza into Claude Desktop's local config file."]),
        ],
      },
      {
        label: "Use wiring instead",
        entries: [
          patchChoice("Windsurf MCP path", ["--patch-guide", "windsurf", "--port", String(port)], ["Use the Windsurf MCP/manual wiring path instead of pretending there is a built-in desktop patch."]),
          patchChoice("OpenAI / Codex-style wiring", ["--patch-guide", "openai-codex", "--port", String(port)], ["Use base URL / provider wiring. No desktop file patch is needed."]),
          patchChoice("Generic MCP manual path", ["--patch-guide", "generic-mcp", "--port", String(port)], ["Use the generic MCP config snippet instead of a built-in desktop patch."]),
        ],
      },
    ],
    footer: compact ? [] : ["Choose a patch target here instead of silently defaulting to Cursor."],
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
    twoColumn: false,
    interactiveEntries: true,
    hero: {
      status: "VERIFY TARGET",
      lines: [
        "Choose what you want to verify first.",
        pickByDensity({
          compact: "Only Cursor and Claude Desktop have a local patch to verify.",
          standard: "Only Cursor and Claude Desktop have a local desktop patch to verify. Windsurf, Codex-style, and generic MCP flows use wiring instead.",
          wide: "Choose what you want to verify first: only Cursor and Claude Desktop have a local desktop patch to verify, while Windsurf, Codex-style, and generic MCP flows use wiring instead.",
        }, density),
      ],
    },
    sections: [
      {
        label: "Verify desktop patch",
        entries: [
          patchChoice("Verify Cursor patch", ["--client", "cursor", "--verify-patch"], ["Inspect ~/.cursor/mcp.json for the NORNR Sentry stanza."]),
          patchChoice("Verify Claude Desktop patch", ["--client", "claude-desktop", "--verify-patch"], ["Inspect Claude Desktop's local config file for the NORNR Sentry stanza."]),
        ],
      },
      {
        label: "No desktop patch to verify",
        entries: [
          patchChoice("Windsurf MCP path", ["--patch-guide", "windsurf", "--port", String(port)], ["This path uses MCP/manual wiring, not a built-in desktop file patch."]),
          patchChoice("OpenAI / Codex-style wiring", ["--patch-guide", "openai-codex", "--port", String(port)], ["This path uses provider wiring, not a desktop file patch."]),
          patchChoice("Generic MCP manual path", ["--patch-guide", "generic-mcp", "--port", String(port)], ["This path uses manual MCP config, not a built-in desktop patch."]),
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
