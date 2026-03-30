import React, { useEffect, useMemo, useRef, useState } from "react";
import { createHash } from "node:crypto";
import { Box, Text, useInput } from "ink";
import { buildWelcomeView, resolveSentryPaletteCommand } from "../runtime/welcome.js";

function redactedWorkspacePath() {
  return "/workspace/project";
}

function formatScopeValue(value = "", screenshotMode = false) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!screenshotMode) return normalized;
  if (normalized === "." || normalized === "./") return redactedWorkspacePath();
  if (normalized.startsWith("/") || normalized.startsWith("~") || normalized.includes("/") || normalized.includes("\\")) {
    return redactedWorkspacePath();
  }
  return normalized;
}

function formatScopeList(values = [], screenshotMode = false) {
  const items = (Array.isArray(values) ? values : []).map((value) => formatScopeValue(value, screenshotMode)).filter(Boolean);
  if (!items.length) return "(none)";
  if (screenshotMode) return Array.from(new Set(items)).join(", ");
  return items.join(", ");
}

function blockedDefaultIndex(actions = [], blocked = false) {
  const preferred = blocked ? ["Block", "Tighten mandate", "Approve once"] : ["Let action clear"];
  for (const label of preferred) {
    const index = actions.indexOf(label);
    if (index >= 0) return index;
  }
  return 0;
}

export function getSentryViewportGuard({ width = 0, height = 0, screenshotMode = false } = {}) {
  const minWidth = screenshotMode ? 68 : 60;
  const minHeight = screenshotMode ? 18 : 14;
  if (width >= minWidth && height >= minHeight) return null;
  return {
    minWidth,
    minHeight,
    width,
    height,
    title: screenshotMode ? "Window too small for screenshot surface." : "Window too small for review surface.",
    detail: screenshotMode
      ? "Increase the terminal size and rerun the capture."
      : "Increase the terminal size before reviewing this lane.",
  };
}

function isCompactViewport(height = 0, screenshotMode = false) {
  const threshold = screenshotMode ? 24 : 28;
  return Number(height || 0) > 0 && Number(height || 0) <= threshold;
}

function isUltraCompactViewport(height = 0, screenshotMode = false) {
  const threshold = screenshotMode ? 22 : 24;
  return Number(height || 0) > 0 && Number(height || 0) <= threshold;
}

function resolveSurfaceLayoutMode({ width = 0, height = 0, screenshotMode = false } = {}) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  const minimalHeight = screenshotMode ? 24 : 28;
  const compactHeight = screenshotMode ? 30 : 38;
  const minimalWidth = screenshotMode ? 72 : 72;
  const compactWidth = screenshotMode ? 92 : 96;
  if ((safeHeight > 0 && safeHeight <= minimalHeight) || (safeWidth > 0 && safeWidth < minimalWidth)) return "minimal";
  if ((safeHeight > 0 && safeHeight <= compactHeight) || (safeWidth > 0 && safeWidth < compactWidth)) return "compact";
  return "full";
}

function resolveWelcomeLayoutMode({ width = 0, height = 0 } = {}) {
  return resolveSurfaceLayoutMode({ width, height, screenshotMode: false });
}

function createAdaptiveTheme({ width = 0, height = 0, screenshotMode = false, panel = "surface" } = {}) {
  const mode = panel === "welcome"
    ? resolveWelcomeLayoutMode({ width, height })
    : resolveSurfaceLayoutMode({ width, height, screenshotMode });
  const minimal = mode === "minimal";
  const compact = mode === "compact";
  const reduced = mode !== "full";
  return {
    mode,
    minimal,
    compact,
    reduced,
    screenPaddingX: screenshotMode ? 2 : 1,
    screenPaddingY: minimal ? 0 : 1,
    compactVertical: reduced || screenshotMode,
    heroLineLimit: minimal ? 1 : reduced ? 2 : Number.POSITIVE_INFINITY,
    sectionLimit: minimal ? 1 : compact ? 2 : Number.POSITIVE_INFINITY,
    showFooter: !reduced,
    showPaletteHint: !minimal && !isUltraCompactViewport(height, screenshotMode),
    showPaletteInline: minimal,
  };
}

function sliceAdaptiveLines(lines = [], limit = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(limit)) return Array.isArray(lines) ? lines : [];
  return (Array.isArray(lines) ? lines : []).slice(0, Math.max(0, limit));
}

function splitIntoColumns(items = [], columnCount = 2) {
  const normalized = Array.isArray(items) ? items : [];
  const count = Math.max(1, Number(columnCount || 2));
  const size = Math.ceil(normalized.length / count);
  return Array.from({ length: count }, (_, index) => normalized.slice(index * size, (index + 1) * size)).filter((column) => column.length);
}

function BottomActionBar({ items = [] }) {
  if (!(items || []).length) return null;
  return React.createElement(
    Box,
    { flexDirection: "row", flexWrap: "wrap", marginTop: 1, marginBottom: 0 },
    ...(items.filter(Boolean).map((item, index) => React.createElement(ActionChip, {
      key: `action-bar-${item.label || index}`,
      label: item.label,
      active: Boolean(item.active),
      focused: Boolean(item.focused),
    }))),
  );
}

function ScreenFrame({ theme, hero, children, footer = [], hotkeys = "", actionBarItems = [], paletteOpen = false, paletteNode = null }) {
  const footerNodes = theme.showFooter
    ? (footer || []).map((line, index) => React.createElement(Text, { key: `screen-footer-${index}`, color: "gray", dimColor: true }, line))
    : [];
  const metaNodes = [
    ...footerNodes,
    theme.showPaletteHint ? React.createElement(CommandPaletteHint, { key: "palette-hint" }) : null,
    hotkeys ? React.createElement(Text, { key: "hotkeys", color: "gray", dimColor: true }, hotkeys) : null,
    paletteOpen ? React.createElement(Box, { key: "palette-wrap", marginTop: 1 }, paletteNode) : null,
  ].filter(Boolean);

  return React.createElement(
    Box,
    { flexDirection: "column", paddingX: theme.screenPaddingX, paddingY: theme.screenPaddingY },
    hero,
    children,
    React.createElement(BottomActionBar, { items: actionBarItems }),
    metaNodes.length ? React.createElement(Box, { flexDirection: "column", marginTop: 1 }, ...metaNodes) : null,
  );
}

function CompactStateNote({ theme, children }) {
  if (!theme?.reduced || !children) return null;
  return React.createElement(Box, { marginTop: 1 }, React.createElement(Text, { color: "gray", dimColor: true }, children));
}

function buildWelcomeNavigationItems({ guidedSetup = null, guidedDismissed = false, launchMap = {}, ultraCompactViewport = false }) {
  const items = [];
  if (guidedSetup?.show && !guidedDismissed) {
    if (Array.isArray(launchMap.y)) items.push({ label: "Secure now", kind: "launch", argv: launchMap.y });
    items.push({ label: "Manual path", kind: "dismiss" });
  }
  if (Array.isArray(launchMap.d)) items.push({ label: "Run demo stop", kind: "launch", argv: launchMap.d });
  if (Array.isArray(launchMap.p)) items.push({ label: "Choose patch / wiring", kind: "launch", argv: launchMap.p });
  if (Array.isArray(launchMap.o)) items.push({ label: "Observe first", kind: "launch", argv: launchMap.o });
  if (Array.isArray(launchMap.s)) items.push({ label: "Serve for real", kind: "launch", argv: launchMap.s });
  if (!ultraCompactViewport && Array.isArray(launchMap.r)) items.push({ label: "Replay attacks", kind: "launch", argv: launchMap.r });
  if (Array.isArray(launchMap.v)) items.push({ label: "Defended records", kind: "launch", argv: launchMap.v });
  if (Array.isArray(launchMap.gCursor)) items.push({ label: "Cursor golden path", kind: "launch", argv: launchMap.gCursor });
  if (Array.isArray(launchMap.gClaude)) items.push({ label: "Claude Desktop golden path", kind: "launch", argv: launchMap.gClaude });
  return items;
}

function formatLineage(lineage = null) {
  if (!lineage || typeof lineage !== "object") return "";
  const chain = Array.isArray(lineage.chain)
    ? lineage.chain.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];
  if (chain.length >= 2) return chain.join(" > ");
  const parent = String(lineage.parentAgentId || lineage.parent || "").trim();
  const agent = String(lineage.agentId || lineage.agent || "").trim();
  return [parent, agent].filter(Boolean).join(" > ");
}

function formatAuditId(session = {}) {
  const seed = [
    String(session.record?.filePath || "").trim(),
    String(session.record?.envelope?.generatedAt || session.intent?.generatedAt || "").trim(),
    String(session.intent?.actionClass || "").trim(),
  ].join("|");
  if (!seed.replace(/\|/g, "").trim()) return "";
  return `nornr-rec-${createHash("sha1").update(seed).digest("hex").slice(0, 6)}`;
}

function formatAuditDigest(session = {}) {
  const seed = [
    String(session.record?.filePath || "").trim(),
    String(session.record?.envelope?.generatedAt || session.intent?.generatedAt || "").trim(),
    String(session.intent?.rawIntent || session.intent?.title || "").trim(),
    String(session.decision?.status || "").trim(),
  ].join("|");
  if (!seed.replace(/\|/g, "").trim()) return "";
  const digest = createHash("sha256").update(seed).digest("hex");
  return `sha256:${digest.slice(0, 4)}...${digest.slice(-4)}`;
}

function formatAuditDate(session = {}) {
  const raw = String(session.record?.envelope?.generatedAt || session.intent?.generatedAt || "").trim();
  if (!raw) return "";
  return raw.slice(0, 10);
}

function formatAuditLine(session = {}) {
  const id = formatAuditId(session);
  const date = formatAuditDate(session);
  if (!id && !date) return "";
  if (!date) return `Defended record: ${id}`;
  if (!id) return `Captured: ${date}`;
  return `Defended record: ${id} / ${date}`;
}

function formatAuditSignal(session = {}) {
  const digest = formatAuditDigest(session);
  const record = formatAuditLine(session);
  if (digest && record) return `Digest: ${digest} | ${record}`;
  return digest || record;
}

function formatSectionLabel(label = "") {
  return String(label || "").trim().toUpperCase();
}

function formatIntentTitle(intent = {}, screenshotMode = false) {
  if (!screenshotMode) return intent.title;
  if (intent.actionClass === "destructive_shell") return "Delete project files outside scope";
  return intent.title;
}

function screenshotDecisionReasons(session = {}) {
  const reasons = session.decision.primaryReason
    ? [session.decision.primaryReason, ...((session.decision.reasons || []).slice(1))]
    : (session.decision.reasons || []);
  const compact = [];
  const seen = new Set();
  for (const reason of reasons) {
    const normalized = String(reason || "").replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    compact.push(normalized);
    if (compact.length >= 2) break;
  }
  return compact;
}

function DetailRow({ label, value, screenshotMode = false, multiline = false }) {
  if (!value) return null;
  if (multiline) {
    return React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, { color: "gray", dimColor: true, bold: true }, formatSectionLabel(label)),
      React.createElement(Text, null, value),
    );
  }
  return React.createElement(
    Text,
    null,
    React.createElement(Text, { color: "gray", dimColor: true, bold: true }, `${formatSectionLabel(label)} `),
    React.createElement(Text, null, value),
  );
}

function resolveActionTone(label = "") {
  const normalized = String(label || "").replace(/^>\s*/, "").trim().toLowerCase();
  if (normalized === "block") return "critical";
  if (normalized === "tighten mandate") return "caution";
  if (normalized === "approve once" || normalized === "let action clear") return "positive";
  return "neutral";
}

function toneColor(tone = "neutral") {
  if (tone === "critical") return "red";
  if (tone === "caution") return "yellow";
  if (tone === "positive") return "green";
  return "white";
}

function SelectableTextRow({ label = "", active = false, tone = "neutral", dim = false }) {
  const accent = toneColor(tone);
  const activeProps = tone === "neutral"
    ? { color: "white", bold: true }
    : { color: "black", backgroundColor: accent, bold: true };

  return React.createElement(
    Text,
    active
      ? activeProps
      : { color: accent === "white" ? undefined : accent, dimColor: dim },
    active ? ` ▸ ${label}` : `   ${label}`,
  );
}

function ActionChip({ label, active = false, screenshotMode = false, focused = false }) {
  const tone = resolveActionTone(label);
  const palette = {
    critical: {
      borderColor: focused ? "white" : active ? "red" : "gray",
      textColor: active ? "red" : "gray",
      dimColor: !active,
    },
    caution: {
      borderColor: focused ? "white" : active ? "yellow" : "gray",
      textColor: active ? "yellow" : "gray",
      dimColor: !active,
    },
    positive: {
      borderColor: focused ? "white" : active ? "green" : "gray",
      textColor: active ? "green" : "gray",
      dimColor: !active,
    },
    neutral: {
      borderColor: focused ? "white" : active ? "white" : "gray",
      textColor: active ? "white" : "gray",
      dimColor: !active,
    },
  }[tone] || {
    borderColor: focused ? "white" : active ? "white" : "gray",
    textColor: active ? "white" : "gray",
    dimColor: !active,
  };

  return React.createElement(
    Box,
    {
      borderStyle: "single",
      borderColor: palette.borderColor,
      paddingX: screenshotMode ? 2 : 1,
      marginRight: 1,
      marginBottom: screenshotMode ? 1 : 0,
    },
    React.createElement(
      Text,
      {
        color: palette.textColor,
        dimColor: palette.dimColor,
        bold: active || tone === "caution",
      },
      label,
    ),
  );
}

function ViewportGuardCard({ guard, screenshotMode = false }) {
  return React.createElement(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: "red",
      paddingX: 2,
      paddingY: screenshotMode ? 1 : 1,
    },
    React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "NORNR SENTRY"),
    React.createElement(Text, { color: "red", bold: true }, guard.title),
    React.createElement(Text, { color: "gray", dimColor: true }, guard.detail),
    React.createElement(Text, null, `Current ${guard.width}x${guard.height} | Minimum ${guard.minWidth}x${guard.minHeight}`),
  );
}

function InfoCard({ label, children, borderColor = "gray", screenshotMode = false, compactVertical = false, minimal = false, focused = false, focusColor = "white", width = undefined }) {
  const resolvedBorderColor = focused ? focusColor : borderColor;
  const resolvedLabelColor = focused
    ? focusColor
    : borderColor === "red"
      ? "red"
      : borderColor === "yellow"
        ? "yellow"
        : borderColor === "green"
          ? "green"
          : "gray";
  if (minimal) {
    return React.createElement(
      Box,
      {
        flexDirection: "column",
        marginBottom: compactVertical ? 0 : 1,
        width,
      },
      React.createElement(Text, { color: resolvedLabelColor, dimColor: !focused && borderColor === "gray", bold: true }, formatSectionLabel(label)),
      children,
    );
  }

  return React.createElement(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: resolvedBorderColor,
      paddingX: 2,
      paddingY: screenshotMode || compactVertical ? 0 : 1,
      marginBottom: compactVertical ? 0 : 1,
      width,
    },
    React.createElement(Text, { color: resolvedLabelColor, dimColor: !focused && borderColor === "gray", bold: true }, formatSectionLabel(label)),
    children,
  );
}

function WelcomeHeroBanner({ hero = {}, width = 80, compactVertical = false, minimal = false }) {
  const narrow = width < 74;
  const status = String(hero.status || "READY").toUpperCase();
  const statusColor = status.includes("READY") || status.includes("LIVE") || status.includes("LISTENING") ? "green" : status.includes("SETUP") ? "yellow" : "white";
  const borderColor = status.includes("SETUP") ? "yellow" : status.includes("LISTENING") ? "green" : "gray";

  if (minimal) {
    return React.createElement(
      Box,
      { flexDirection: "column", marginBottom: compactVertical ? 0 : 1, width: "100%" },
      React.createElement(
        Box,
        { justifyContent: "space-between", flexDirection: narrow ? "column" : "row" },
        React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "NORNR SENTRY"),
        React.createElement(Text, { color: statusColor, bold: true }, status),
      ),
      ...((hero.lines || []).map((line, index) => React.createElement(Text, { key: `welcome-hero-${index}` }, line))),
    );
  }

  return React.createElement(
    Box,
    {
      borderStyle: "single",
      borderColor,
      paddingX: 2,
      paddingY: compactVertical ? 0 : 1,
      marginBottom: compactVertical ? 0 : 1,
      flexDirection: "column",
      width: "100%",
    },
    React.createElement(
      Box,
      { justifyContent: "space-between", flexDirection: narrow ? "column" : "row" },
      React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "NORNR SENTRY"),
      React.createElement(Text, { color: statusColor, bold: true }, status),
    ),
    ...((hero.lines || []).map((line, index) => React.createElement(Text, { key: `welcome-hero-${index}` }, line))),
  );
}

function WelcomeSectionCard({ section = {}, width = 80, compactVertical = false, minimal = false, focused = false, selectedLabel = "" }) {
  const narrow = width < 74;
  return React.createElement(
    InfoCard,
    { label: section.label, borderColor: "gray", compactVertical, minimal, focused, width: "100%" },
    ...((section.entries || []).flatMap((entry, index) => {
      const nodes = [];
      const selected = String(selectedLabel || "").trim() === String(entry.label || "").trim();
      if (index > 0) {
        nodes.push(React.createElement(Box, { key: `welcome-gap-${section.label}-${index}`, marginBottom: compactVertical ? 0 : 1 }));
      }
      nodes.push(
        React.createElement(
          Box,
          {
            key: `welcome-entry-${section.label}-${entry.label}`,
            flexDirection: "column",
            marginBottom: 0,
          },
          React.createElement(SelectableTextRow, { label: entry.label, active: selected, tone: "neutral" }),
          ...((entry.commandLines || []).map((line, lineIndex) => React.createElement(Text, { key: `welcome-command-${entry.label}-${lineIndex}` }, `  ${line}`))),
          ...((entry.detailLines || []).map((line, lineIndex) => React.createElement(Text, { key: `welcome-detail-${entry.label}-${lineIndex}`, color: narrow ? "gray" : "gray", dimColor: true }, `  ${line}`))),
        ),
      );
      return nodes;
    })),
  );
}

function CompactWelcomeCard({ guidedSetup = null, guidedDismissed = false, ultraCompactViewport = false, minimal = false, focused = false, selectedLabel = "" }) {
  const lines = [];
  if (guidedSetup?.show && !guidedDismissed) {
    lines.push({ label: "Secure now", line: "y Secure now" });
    lines.push({ label: "Manual path", line: "n Manual path" });
  }
  lines.push({ label: "Run demo stop", line: "d Run demo stop" });
  lines.push({ label: "Choose patch / wiring", line: "p Patch / wiring" });
  lines.push({ label: "Observe first", line: "o Observe first" });
  lines.push({ label: "Serve for real", line: "s Serve for real" });
  if (!ultraCompactViewport) lines.push({ label: "Replay attacks", line: "r Replay attacks" });
  lines.push({ label: "Defended records", line: "v Defended records" });

  const renderedLines = lines.map((entry, index) => {
    const selected = String(selectedLabel || "").trim() === String(entry.label || "").trim();
    return React.createElement(SelectableTextRow, {
      key: `compact-welcome-${index}`,
      label: entry.line,
      active: selected,
      tone: "neutral",
    });
  });

  if (minimal) {
    return React.createElement(
      Box,
      { flexDirection: "column", marginBottom: 0 },
      React.createElement(Text, { color: focused ? "white" : "gray", dimColor: !focused, bold: true }, "START HERE"),
      ...renderedLines,
    );
  }

  return React.createElement(
    InfoCard,
    { label: "Start here", borderColor: "gray", compactVertical: true, focused, width: "100%" },
    ...renderedLines,
  );
}

function SurfaceSectionCard({ section = {}, width = 80, compactVertical = false, minimal = false, interactive = false, focused = false, selectedLabel = "", selectedKey = "" }) {
  const narrow = width < 74;
  const compactEntries = Boolean(section.compactEntries);
  const lineNodes = (section.lines || []).map((line, index) =>
    React.createElement(Text, { key: `surface-line-${section.label}-${index}` }, line),
  );
  const entryNodes = (section.entries || []).flatMap((entry, index) => {
    const nodes = [];
    const entrySelectionKey = String(entry.selectionKey || entry.meta?.filePath || entry.label || `${section.label}-${index}`).trim();
    const selected = selectedKey
      ? String(selectedKey).trim() === entrySelectionKey
      : String(selectedLabel || "").trim() === String(entry.label || "").trim();
    const entryTone = String(entry.tone || entry.meta?.tone || "neutral").trim() || "neutral";
    const detailLines = compactEntries && Array.isArray(entry.compactDetailLines) && entry.compactDetailLines.length
      ? entry.compactDetailLines
      : (entry.detailLines || []);
    const commandLines = compactEntries && Array.isArray(entry.compactCommandLines) && entry.compactCommandLines.length
      ? entry.compactCommandLines
      : (entry.commandLines || []);
    if (index > 0) {
      nodes.push(React.createElement(Box, { key: `surface-gap-${section.label}-${index}`, marginBottom: compactVertical || compactEntries ? 0 : 1 }));
    }
    nodes.push(
      React.createElement(
        Box,
        {
          key: `surface-entry-${section.label}-${entrySelectionKey || index}`,
          flexDirection: "column",
          marginBottom: compactEntries ? 0 : 0,
        },
        entry.label
          ? interactive
            ? React.createElement(SelectableTextRow, { label: entry.label, active: selected, tone: "neutral" })
            : React.createElement(Text, { bold: true }, entry.label)
          : null,
        ...((commandLines || []).map((line, lineIndex) => React.createElement(Text, { key: `surface-command-${entrySelectionKey || index}-${lineIndex}`, color: compactEntries && lineIndex === 0 ? toneColor(entryTone) : undefined, bold: compactEntries && lineIndex === 0 }, `  ${line}`))),
        ...((detailLines || []).map((line, lineIndex) => React.createElement(Text, { key: `surface-detail-${entrySelectionKey || index}-${lineIndex}`, color: compactEntries && lineIndex === 0 ? "gray" : "gray", dimColor: true }, `  ${line}`))),
      ),
    );
    return nodes;
  });

  return React.createElement(
    InfoCard,
    { label: section.label, borderColor: section.tone === "critical" ? "red" : "gray", compactVertical, minimal, focused, width: "100%" },
    ...(entryNodes.length ? entryNodes : lineNodes.length ? lineNodes : [React.createElement(Text, { key: `surface-empty-${section.label}`, color: "gray", dimColor: true }, narrow ? "(no data)" : "No additional data.")]),
  );
}

function CommandPalette({ value = "", message = "", minimal = false }) {
  return React.createElement(
    Box,
    {
      flexDirection: "column",
      borderStyle: minimal ? undefined : "single",
      borderColor: minimal ? undefined : "gray",
      paddingX: minimal ? 0 : 1,
      marginTop: 1,
    },
    React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "COMMAND PALETTE"),
    React.createElement(Text, null, `: ${value}`),
    message ? React.createElement(Text, { color: "red" }, message) : React.createElement(Text, { color: "gray", dimColor: true }, "Try: demo, patch, verify, observe, serve, replay, records, proof, golden, runtime, setup, summary, welcome, quit"),
  );
}

function CommandPaletteHint() {
  return React.createElement(
    Text,
    { color: "gray", dimColor: true },
    React.createElement(Text, { color: "white", bold: true }, ":"),
    React.createElement(Text, null, " command palette"),
    React.createElement(Text, { color: "gray", dimColor: true }, "  ·  "),
    React.createElement(Text, null, "/ also opens"),
  );
}

function usePaletteController({ paletteOptions = {}, onLaunch, onExit }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteValue, setPaletteValue] = useState("");
  const [paletteMessage, setPaletteMessage] = useState("");

  const handlePaletteInput = (input, key) => {
    if (!paletteOpen) return false;
    if (key.escape) {
      setPaletteOpen(false);
      setPaletteValue("");
      setPaletteMessage("");
      return true;
    }
    if (key.return) {
      const result = resolveSentryPaletteCommand(paletteOptions, paletteValue);
      if (result.kind === "launch") {
        setPaletteOpen(false);
        setPaletteValue("");
        setPaletteMessage("");
        onLaunch?.(result.argv);
        return true;
      }
      if (result.kind === "exit") {
        setPaletteOpen(false);
        setPaletteValue("");
        setPaletteMessage("");
        onExit?.();
        return true;
      }
      if (result.kind === "empty") {
        setPaletteOpen(false);
        setPaletteValue("");
        setPaletteMessage("");
        return true;
      }
      setPaletteMessage(result.message || "Unknown command.");
      return true;
    }
    if (key.backspace || key.delete) {
      setPaletteValue((current) => current.slice(0, -1));
      setPaletteMessage("");
      return true;
    }
    if (input && /^[ -~]$/.test(input)) {
      setPaletteValue((current) => current + input);
      setPaletteMessage("");
      return true;
    }
    return true;
  };

  const openPalette = (prefix = "") => {
    setPaletteOpen(true);
    setPaletteValue(prefix);
    setPaletteMessage("");
  };

  return {
    paletteOpen,
    paletteValue,
    paletteMessage,
    openPalette,
    handlePaletteInput,
  };
}

export function SentrySurfaceApp({ buildView, data, paletteOptions = {}, navigation = {}, onExit, onLaunch }) {
  const stdoutWidth = Number(process.stdout?.columns || 80);
  const stdoutHeight = Number(process.stdout?.rows || 24);
  const theme = createAdaptiveTheme({ width: stdoutWidth, height: stdoutHeight, panel: "surface" });
  const view = useMemo(() => buildView(data, stdoutWidth), [buildView, data, stdoutWidth]);
  const minWidth = Number(view?.minWidth || 52);
  const minHeight = Number(view?.minHeight || 12);
  const guard = stdoutWidth < minWidth || stdoutHeight < minHeight
    ? {
      title: "Window too small for surface.",
      detail: "Widen the terminal to inspect this Sentry surface.",
      width: stdoutWidth,
      height: stdoutHeight,
      minWidth,
      minHeight,
    }
    : null;
  const palette = usePaletteController({ paletteOptions, onLaunch, onExit });
  const homeArgv = Array.isArray(navigation.homeArgv) ? navigation.homeArgv : [];
  const backArgv = Array.isArray(navigation.backArgv) ? navigation.backArgv : null;
  const sections = view.sections || [];
  const visibleSections = sections.slice(0, theme.sectionLimit);
  const hiddenSections = Math.max(0, sections.length - visibleSections.length);
  const hero = theme.reduced
    ? { ...view.hero, lines: sliceAdaptiveLines(view.hero?.lines || [], theme.heroLineLimit) }
    : view.hero;
  const interactiveEntries = useMemo(
    () => visibleSections.flatMap((section, sectionIndex) => (section.entries || [])
      .filter((entry) => Array.isArray(entry?.argv) && entry.argv.length)
      .map((entry) => ({
        ...entry,
        label: String(entry.label || "").trim(),
        selectionKey: String(entry.selectionKey || entry.meta?.filePath || entry.label || `${section.label}-${sectionIndex}`).trim(),
        argv: entry.argv,
        sectionIndex,
      }))),
    [visibleSections],
  );
  const interactive = Boolean(view.interactiveEntries && interactiveEntries.length);
  const interactiveSections = useMemo(() => {
    if (!interactive) return [];
    return visibleSections
      .map((section, sectionIndex) => ({
        label: section.label,
        indices: interactiveEntries
          .map((entry, entryIndex) => (entry.sectionIndex === sectionIndex ? entryIndex : null))
          .filter((entryIndex) => Number.isInteger(entryIndex)),
      }))
      .filter((section) => section.indices.length);
  }, [interactive, interactiveEntries, visibleSections]);
  const [selectedEntryIndex, setSelectedEntryIndex] = useState(0);
  const initialSelectionKeyRef = useRef("");
  const selectedEntry = interactiveEntries[selectedEntryIndex] || interactiveEntries[0] || null;
  const selectionActions = useMemo(
    () => (typeof view.buildSelectionActions === "function" ? (view.buildSelectionActions(selectedEntry) || []) : []),
    [selectedEntry, view],
  );
  const selectionSummary = useMemo(
    () => (typeof view.buildSelectionSummary === "function" ? view.buildSelectionSummary(selectedEntry) : null),
    [selectedEntry, view],
  );
  const activeSectionIndex = useMemo(() => {
    const foundIndex = interactiveSections.findIndex((section) => section.indices.includes(selectedEntryIndex));
    return foundIndex >= 0 ? foundIndex : 0;
  }, [interactiveSections, selectedEntryIndex]);

  useEffect(() => {
    setSelectedEntryIndex((current) => Math.max(0, Math.min(current, Math.max(0, interactiveEntries.length - 1))));
  }, [interactiveEntries.length]);

  const preferredSectionLabel = String(view.initialSelectionSectionLabel || "").trim();
  const interactiveSelectionKey = useMemo(
    () => `${preferredSectionLabel}::${interactiveEntries.map((entry) => `${entry.sectionIndex}:${entry.selectionKey}`).join("|")}`,
    [interactiveEntries, preferredSectionLabel],
  );

  useEffect(() => {
    if (!interactiveEntries.length) return;
    if (initialSelectionKeyRef.current === interactiveSelectionKey) return;
    initialSelectionKeyRef.current = interactiveSelectionKey;
    setSelectedEntryIndex((current) => {
      if (current >= 0 && current < interactiveEntries.length) return current;
      if (!preferredSectionLabel) return 0;
      const preferredIndex = interactiveEntries.findIndex((entry) => String(visibleSections[entry.sectionIndex]?.label || "").trim() === preferredSectionLabel);
      return preferredIndex >= 0 ? preferredIndex : 0;
    });
  }, [interactiveEntries, interactiveSelectionKey, preferredSectionLabel, visibleSections]);

  useInput((input, key) => {
    if (palette.handlePaletteInput(input, key)) return;
    if (input === ":" || input === "/") {
      palette.openPalette("");
      return;
    }
    if (input === "h" || input === "H" || input === "w" || input === "W") {
      onLaunch?.(homeArgv);
      return;
    }
    if ((input === "b" || input === "B" || key.escape) && backArgv && backArgv.length) {
      onLaunch?.(backArgv);
      return;
    }
    if (interactive) {
      if (key.tab || input === "\t" || input === "\u001b[Z" || key.leftArrow || key.rightArrow) {
        const sectionCount = Math.max(1, interactiveSections.length);
        const delta = key.leftArrow || key.shift || input === "\u001b[Z" ? -1 : 1;
        const nextSectionIndex = (((activeSectionIndex + delta) % sectionCount) + sectionCount) % sectionCount;
        const currentSection = interactiveSections[activeSectionIndex] || null;
        const nextSection = interactiveSections[nextSectionIndex] || null;
        if (nextSection?.indices?.length) {
          const currentPosition = Math.max(0, currentSection?.indices?.indexOf(selectedEntryIndex) ?? 0);
          const nextPosition = Math.min(currentPosition, nextSection.indices.length - 1);
          setSelectedEntryIndex(nextSection.indices[nextPosition] ?? nextSection.indices[0]);
        }
        return;
      }
      if (key.upArrow || key.downArrow) {
        const currentSection = interactiveSections[activeSectionIndex] || null;
        const indices = currentSection?.indices?.length ? currentSection.indices : interactiveEntries.map((_, index) => index);
        const currentPosition = Math.max(0, indices.indexOf(selectedEntryIndex));
        const nextPosition = key.upArrow
          ? (currentPosition === 0 ? Math.max(0, indices.length - 1) : currentPosition - 1)
          : (indices.length ? (currentPosition + 1) % indices.length : 0);
        setSelectedEntryIndex(indices[nextPosition] || 0);
        return;
      }
      if (key.return && selectedEntry?.argv?.length) {
        onLaunch?.(selectedEntry.argv);
        return;
      }
      const numericIndex = Number.parseInt(input, 10);
      if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= selectionActions.length) {
        const action = selectionActions[numericIndex - 1];
        if (action?.argv?.length) {
          onLaunch?.(action.argv);
          return;
        }
      }
    }
    if ((key.ctrl && input === "c") || key.return || input === "q") onExit?.();
  });

  if (guard) {
    return React.createElement(
      Box,
      { flexDirection: "column", paddingX: theme.screenPaddingX, paddingY: theme.screenPaddingY },
      React.createElement(ViewportGuardCard, { guard }),
    );
  }

  const selectionSummaryNode = selectionSummary
    ? React.createElement(
      Box,
      { marginTop: 0 },
      React.createElement(
        InfoCard,
        {
          label: selectionSummary.label || "Selected item",
          borderColor: selectionSummary.tone === "critical" ? "red" : selectionSummary.tone === "caution" ? "yellow" : selectionSummary.tone === "positive" ? "green" : "gray",
          compactVertical: theme.compactVertical,
          minimal: theme.minimal,
          focused: true,
          focusColor: selectionSummary.tone === "critical" ? "red" : selectionSummary.tone === "caution" ? "yellow" : selectionSummary.tone === "positive" ? "green" : "white",
          width: "100%",
        },
        ...((selectionSummary.lines || []).map((line, index) => React.createElement(
          Text,
          {
            key: `selection-summary-${index}`,
            color: index === 0 ? toneColor(selectionSummary.tone || "neutral") : index === 1 ? "white" : index === 2 ? "gray" : undefined,
            dimColor: index === 2,
            bold: index <= 1,
          },
          line,
        ))),
      ),
    )
    : null;
  const selectionActionsNode = selectionActions.length
    ? React.createElement(
      Box,
      { marginTop: theme.compactVertical ? 0 : 1 },
      React.createElement(
        InfoCard,
        { label: selectedEntry?.meta?.kind === "record" ? "Selected proof actions" : "Selected actions", borderColor: "gray", compactVertical: theme.compactVertical, minimal: theme.minimal, width: "100%" },
        ...selectionActions.map((action, index) => React.createElement(
          Box,
          { key: `selection-action-${index}`, flexDirection: "column", marginBottom: 0 },
          React.createElement(Text, { bold: true }, `${index + 1} ${action.label}`),
          ...((action.commandLines || []).slice(0, 1).map((line, lineIndex) => React.createElement(Text, { key: `selection-action-command-${index}-${lineIndex}` }, `  ${line}`))),
          ...((action.detailLines || []).slice(0, 1).map((line, lineIndex) => React.createElement(Text, { key: `selection-action-detail-${index}-${lineIndex}`, color: "gray", dimColor: true }, `  ${line}`))),
        )),
      ),
    )
    : null;
  const isRecordFocusedSurface = Boolean(view.twoColumn && !theme.reduced && selectedEntry?.meta?.kind === "record");
  const recordPrimarySection = isRecordFocusedSurface ? visibleSections.find((section) => section.label === "Proof queue") || visibleSections[0] : null;
  const recordSecondarySections = isRecordFocusedSurface
    ? visibleSections.filter((section) => section !== recordPrimarySection)
    : [];
  const recordFocusedSidebarSection = isRecordFocusedSurface
    ? recordSecondarySections.find((section) => visibleSections.indexOf(section) === activeSectionIndex && section.label !== "Proof queue") || null
    : null;
  const recordDefaultSidebarSection = isRecordFocusedSurface
    ? recordSecondarySections.find((section) => section.label === "Proof posture") || recordSecondarySections[0] || null
    : null;
  const recordRenderedSidebarSection = recordFocusedSidebarSection || recordDefaultSidebarSection;

  return React.createElement(ScreenFrame, {
    theme,
    hero: React.createElement(WelcomeHeroBanner, {
      hero,
      width: stdoutWidth,
      compactVertical: theme.compactVertical,
      minimal: theme.minimal,
    }),
    footer: view.footer || [],
    hotkeys: interactive
      ? backArgv?.length
        ? theme.minimal ? `Esc/b back · h home · ←/→ section · ↑/↓ choose · Enter open${selectionActions.length ? ` · 1-${selectionActions.length} actions` : ""} · q close · : palette` : theme.reduced ? `Esc/b back · h home · ←/→ section · ↑/↓ choose · Enter open${selectionActions.length ? ` · 1-${selectionActions.length} actions` : ""} · q close · : palette` : `Esc/b back · h home · ←/→ section · ↑/↓ choose · Enter open${selectionActions.length ? ` · 1-${selectionActions.length} actions` : ""} · q close`
        : theme.minimal ? `h home · ←/→ section · ↑/↓ choose · Enter open${selectionActions.length ? ` · 1-${selectionActions.length} actions` : ""} · q close · : palette` : theme.reduced ? `h home · ←/→ section · ↑/↓ choose · Enter open${selectionActions.length ? ` · 1-${selectionActions.length} actions` : ""} · q close · : palette` : `h home · ←/→ section · ↑/↓ choose · Enter open${selectionActions.length ? ` · 1-${selectionActions.length} actions` : ""} · q close`
      : backArgv?.length
        ? theme.minimal ? "Esc/b back · h home · q close · : palette" : theme.reduced ? "Esc/b back · h home · Enter/q close · : palette" : "Esc/b back · h home · Enter/q close"
        : theme.minimal ? "h home · q close · : palette" : theme.reduced ? "h home · Enter/q close · : palette" : "h home · Enter/q close",
    actionBarItems: selectionActions.slice(0, 3).map((action, index) => ({ label: `${index + 1} ${action.label}`, active: true, focused: false })),
    paletteOpen: palette.paletteOpen,
    paletteNode: React.createElement(CommandPalette, { value: palette.paletteValue, message: palette.paletteMessage, minimal: theme.minimal }),
  },
  React.createElement(
    React.Fragment,
    null,
    isRecordFocusedSurface
      ? React.createElement(
        Box,
        {
          flexDirection: "row",
          columnGap: 1,
          alignItems: "flex-start",
        },
        React.createElement(
          Box,
          {
            key: "surface-column-proof-queue",
            flexDirection: "column",
            width: Math.max(36, Math.floor((stdoutWidth - 5) / 2)),
            flexGrow: 1,
          },
          recordPrimarySection
            ? React.createElement(
              Box,
              { key: recordPrimarySection.label, marginBottom: 1 },
              React.createElement(SurfaceSectionCard, {
                section: recordPrimarySection,
                width: stdoutWidth,
                compactVertical: theme.compactVertical,
                minimal: theme.minimal,
                interactive,
                focused: interactive ? activeSectionIndex === visibleSections.indexOf(recordPrimarySection) : false,
                selectedLabel: interactive ? selectedEntry?.label || "" : "",
                selectedKey: interactive ? selectedEntry?.selectionKey || "" : "",
              }),
            )
            : null,
        ),
        React.createElement(
          Box,
          {
            key: "surface-column-proof-detail",
            flexDirection: "column",
            width: Math.max(32, Math.floor((stdoutWidth - 5) / 2)),
            flexGrow: 1,
          },
          selectionSummaryNode,
          recordRenderedSidebarSection
            ? React.createElement(
              Box,
              { key: recordRenderedSidebarSection.label, marginTop: 0, marginBottom: 1 },
              React.createElement(SurfaceSectionCard, {
                section: recordRenderedSidebarSection,
                width: stdoutWidth,
                compactVertical: theme.compactVertical,
                minimal: theme.minimal,
                interactive,
                focused: interactive ? activeSectionIndex === visibleSections.indexOf(recordRenderedSidebarSection) : false,
                selectedLabel: interactive ? selectedEntry?.label || "" : "",
                selectedKey: interactive ? selectedEntry?.selectionKey || "" : "",
              }),
            )
            : null,
        ),
      )
      : view.twoColumn && !theme.reduced
        ? React.createElement(
          Box,
          {
            flexDirection: "row",
            columnGap: 1,
            alignItems: "flex-start",
          },
          ...splitIntoColumns(visibleSections, 2).map((columnSections, columnIndex) => React.createElement(
            Box,
            {
              key: `surface-column-${columnIndex}`,
              flexDirection: "column",
              width: Math.max(32, Math.floor((stdoutWidth - 5) / 2)),
              flexGrow: 1,
            },
            ...columnSections.map((section) => {
              const originalIndex = visibleSections.indexOf(section);
              return React.createElement(
                Box,
                { key: section.label, marginBottom: 1 },
                React.createElement(SurfaceSectionCard, {
                  section,
                  width: stdoutWidth,
                  compactVertical: theme.compactVertical,
                  minimal: theme.minimal,
                  interactive,
                  focused: interactive ? activeSectionIndex === originalIndex : false,
                  selectedLabel: interactive ? selectedEntry?.label || "" : "",
                  selectedKey: interactive ? selectedEntry?.selectionKey || "" : "",
                }),
              );
            }),
          )),
        )
        : React.createElement(
          Box,
          {
            flexDirection: "column",
            columnGap: 0,
          },
          ...(visibleSections.map((section, index) => React.createElement(
            Box,
            {
              key: section.label,
              width: "100%",
            },
            React.createElement(SurfaceSectionCard, {
              section,
              width: stdoutWidth,
              compactVertical: theme.compactVertical,
              minimal: theme.minimal,
              interactive,
              focused: interactive ? activeSectionIndex === index : false,
              selectedLabel: interactive ? selectedEntry?.label || "" : "",
              selectedKey: interactive ? selectedEntry?.selectionKey || "" : "",
            }),
          ))),
        ),
    !isRecordFocusedSurface ? selectionSummaryNode : null,
    !isRecordFocusedSurface ? selectionActionsNode : null,
    React.createElement(
      CompactStateNote,
      { theme },
      isRecordFocusedSurface
        ? "←/→ swaps the right-hand proof panel while the queue stays in view."
        : hiddenSections > 0
          ? `${hiddenSections} more section${hiddenSections === 1 ? "" : "s"} appear in a taller window.`
          : selectionActions.length
            ? `Open the selected item with Enter, or use 1-${selectionActions.length} for the quick actions above.`
            : interactive && theme.reduced
              ? "Choose a replay scenario here, then open it with Enter."
              : theme.reduced ? "Compact operator view keeps the top of the lane in sight." : "",
    ),
  ));
}

export function SentryWelcomeApp({ options = {}, onExit, onLaunch }) {
  const stdoutWidth = Number(process.stdout?.columns || 80);
  const stdoutHeight = Number(process.stdout?.rows || 24);
  const theme = createAdaptiveTheme({ width: stdoutWidth, height: stdoutHeight, panel: "welcome" });
  const ultraCompactViewport = isUltraCompactViewport(stdoutHeight);
  const view = useMemo(() => buildWelcomeView(options, stdoutWidth), [options, stdoutWidth]);
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const port = Number(options.port || 4317) || 4317;
  const guidedSetup = view.guidedSetup || null;
  const [guidedDismissed, setGuidedDismissed] = useState(false);
  const launchMap = useMemo(() => ({
    y: guidedSetup?.show ? guidedSetup.argv : null,
    d: ["--client", shield, "--demo", "destructive_shell"],
    p: ["--patch-client"],
    o: ["--client", shield, "--serve", "--port", String(port), "--shadow-mode", "--no-upstream"],
    s: ["--client", shield, "--serve", "--port", String(port)],
    r: ["--client", shield, "--policy-replay"],
    v: ["--client", shield, "--records"],
    gCursor: ["--client", "cursor", "--golden-path", "--port", String(port)],
    gClaude: ["--client", "claude-desktop", "--golden-path", "--port", String(port)],
  }), [guidedSetup?.argv, guidedSetup?.show, port, shield]);
  const palette = usePaletteController({ paletteOptions: { ...options, shield, port }, onLaunch, onExit });
  const sections = useMemo(
    () => (guidedDismissed ? (view.sections || []).filter((section) => section.label !== "Guided setup") : (view.sections || [])),
    [guidedDismissed, view.sections],
  );
  const displayedSections = theme.minimal ? [] : sections.slice(0, theme.sectionLimit);
  const hiddenSections = Math.max(0, sections.length - displayedSections.length);
  const hero = theme.reduced
    ? { ...view.hero, lines: sliceAdaptiveLines(view.hero?.lines || [], theme.heroLineLimit) }
    : view.hero;
  const welcomeItems = useMemo(
    () => buildWelcomeNavigationItems({ guidedSetup, guidedDismissed, launchMap, ultraCompactViewport }),
    [guidedDismissed, guidedSetup, launchMap, ultraCompactViewport],
  );
  const welcomeNavigationSections = useMemo(() => {
    const byLabel = new Map(welcomeItems.map((item, index) => [String(item.label || "").trim(), index]));
    if (theme.reduced) {
      return welcomeItems.length ? [{ label: "Start here", indices: welcomeItems.map((_, index) => index) }] : [];
    }
    return displayedSections
      .map((section) => ({
        label: section.label,
        indices: (section.entries || [])
          .map((entry) => byLabel.get(String(entry.label || "").trim()))
          .filter((index) => Number.isInteger(index)),
      }))
      .filter((section) => section.indices.length);
  }, [displayedSections, theme.reduced, welcomeItems]);
  const [selectedWelcomeIndex, setSelectedWelcomeIndex] = useState(0);
  const selectedWelcomeItem = welcomeItems[selectedWelcomeIndex] || welcomeItems[0] || null;
  const activeWelcomeSectionIndex = useMemo(() => {
    const foundIndex = welcomeNavigationSections.findIndex((section) => section.indices.includes(selectedWelcomeIndex));
    return foundIndex >= 0 ? foundIndex : 0;
  }, [selectedWelcomeIndex, welcomeNavigationSections]);

  useEffect(() => {
    setSelectedWelcomeIndex((current) => Math.max(0, Math.min(current, Math.max(0, welcomeItems.length - 1))));
  }, [welcomeItems.length]);

  useInput((input, key) => {
    if (palette.handlePaletteInput(input, key)) return;
    if (input === ":" || input === "/") {
      palette.openPalette("");
      return;
    }
    if ((input === "n" || input === "N") && guidedSetup?.show && !guidedDismissed) {
      setGuidedDismissed(true);
      return;
    }
    if (key.tab || input === "\t" || input === "\u001b[Z") {
      const sectionCount = Math.max(1, welcomeNavigationSections.length);
      const delta = key.shift || input === "\u001b[Z" ? -1 : 1;
      const nextSectionIndex = (((activeWelcomeSectionIndex + delta) % sectionCount) + sectionCount) % sectionCount;
      const nextSection = welcomeNavigationSections[nextSectionIndex] || null;
      if (nextSection?.indices?.length) setSelectedWelcomeIndex(nextSection.indices[0]);
      return;
    }
    if (key.upArrow || key.leftArrow) {
      const currentSection = welcomeNavigationSections[activeWelcomeSectionIndex] || null;
      const indices = currentSection?.indices?.length ? currentSection.indices : welcomeItems.map((_, index) => index);
      const currentPosition = Math.max(0, indices.indexOf(selectedWelcomeIndex));
      const nextPosition = currentPosition === 0 ? Math.max(0, indices.length - 1) : currentPosition - 1;
      setSelectedWelcomeIndex(indices[nextPosition] || 0);
      return;
    }
    if (key.downArrow || key.rightArrow) {
      const currentSection = welcomeNavigationSections[activeWelcomeSectionIndex] || null;
      const indices = currentSection?.indices?.length ? currentSection.indices : welcomeItems.map((_, index) => index);
      const currentPosition = Math.max(0, indices.indexOf(selectedWelcomeIndex));
      const nextPosition = indices.length ? (currentPosition + 1) % indices.length : 0;
      setSelectedWelcomeIndex(indices[nextPosition] || 0);
      return;
    }
    if (key.return && selectedWelcomeItem) {
      if (selectedWelcomeItem.kind === "dismiss") {
        setGuidedDismissed(true);
      } else {
        onLaunch?.(selectedWelcomeItem.argv || []);
      }
      return;
    }
    if (input && launchMap[input]) {
      onLaunch?.(launchMap[input]);
      return;
    }
    if (key.escape || input === "q") onExit?.();
  });

  if (view.guard) {
    return React.createElement(ScreenFrame, {
      theme,
      hero: React.createElement(WelcomeHeroBanner, {
        hero,
        width: stdoutWidth,
        compactVertical: theme.compactVertical,
        minimal: theme.minimal,
      }),
      footer: view.footer || [],
      hotkeys: theme.minimal ? "Tab focus · ↑/↓ choose · Enter select · y/n/d/p/o/s/r · q close" : "Tab focus · ↑/↓ choose · Enter select · y/n/d/p/o/s/r · q close · : palette",
      actionBarItems: [],
      paletteOpen: palette.paletteOpen,
      paletteNode: React.createElement(CommandPalette, { value: palette.paletteValue, message: palette.paletteMessage, minimal: theme.minimal }),
    },
    React.createElement(
      InfoCard,
      { label: view.guard.title, borderColor: "red", compactVertical: theme.compactVertical, minimal: theme.minimal, width: "100%" },
      ...((view.guard.lines || []).map((line, index) => React.createElement(Text, { key: `guard-${index}` }, line))),
    ));
  }

  return React.createElement(ScreenFrame, {
    theme,
    hero: React.createElement(WelcomeHeroBanner, {
      hero,
      width: stdoutWidth,
      compactVertical: theme.compactVertical,
      minimal: theme.minimal,
    }),
    footer: view.footer || [],
    hotkeys: theme.minimal
      ? "Tab focus · ↑/↓ choose · Enter select · y/n/d/p/o/s/r/v · q close"
      : theme.reduced
        ? "Tab focus · ↑/↓ choose · Enter select · y/n/d/p/o/s/r/v · q close · : palette"
        : guidedSetup?.show && !guidedDismissed
          ? "Tab focus · ↑/↓ choose · Enter select · y secure · n path · d demo · p patch/wiring · o observe · s serve · r replay attacks · v records · q close"
          : "Tab focus · ↑/↓ choose · Enter select · d demo · p patch/wiring · o observe · s serve · r replay attacks · v records · q close",
    actionBarItems: [],
    paletteOpen: palette.paletteOpen,
    paletteNode: React.createElement(CommandPalette, { value: palette.paletteValue, message: palette.paletteMessage, minimal: theme.minimal }),
  },
  React.createElement(
    React.Fragment,
    null,
    theme.reduced
      ? React.createElement(CompactWelcomeCard, { guidedSetup, guidedDismissed, ultraCompactViewport, minimal: theme.minimal, focused: true, selectedLabel: selectedWelcomeItem?.label || "" })
      : React.createElement(
        Box,
        {
          flexDirection: view.twoColumn ? "row" : "column",
          columnGap: view.twoColumn ? 1 : 0,
        },
        ...(displayedSections.map((section, index) => React.createElement(
          Box,
          {
            key: section.label,
            width: view.twoColumn ? Math.max(32, Math.floor((stdoutWidth - 5) / 2)) : "100%",
            flexGrow: view.twoColumn ? 1 : 0,
          },
          React.createElement(WelcomeSectionCard, { section, width: stdoutWidth, compactVertical: false, minimal: false, focused: activeWelcomeSectionIndex === index, selectedLabel: selectedWelcomeItem?.label || "" }),
        ))),
      ),
    React.createElement(
      CompactStateNote,
      { theme },
      hiddenSections > 0
        ? `Open a taller window to reveal ${hiddenSections} more onboarding section${hiddenSections === 1 ? "" : "s"}.`
        : theme.reduced ? "Start here keeps demo, patch/wiring and observe one key away." : "",
    ),
  ));
}

function RuntimeOptionRow({ option = {}, selected = false, focused = false }) {
  const label = `${formatSectionLabel(option.label)} ${option.enabled ? "enabled" : "disabled"}`;
  const textProps = selected
    ? { color: "white", bold: true }
    : option.enabled
      ? { color: "green" }
      : {};

  return React.createElement(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    React.createElement(
      Text,
      textProps,
      selected ? ` ▸ ${label}` : `   ${label}`,
    ),
    React.createElement(Text, { color: "gray", dimColor: true }, `  ${option.detail}`),
  );
}

export function SentryRuntimeConfigApp({ options = {}, buildView, navigation = {}, onApply, onExit, onLaunch }) {
  const stdoutWidth = Number(process.stdout?.columns || 80);
  const stdoutHeight = Number(process.stdout?.rows || 24);
  const theme = createAdaptiveTheme({ width: stdoutWidth, height: stdoutHeight, panel: "surface" });
  const view = useMemo(() => buildView(options, stdoutWidth), [buildView, options, stdoutWidth]);
  const minWidth = Number(view?.minWidth || 56);
  const minHeight = Number(view?.minHeight || 14);
  const guard = stdoutWidth < minWidth || stdoutHeight < minHeight
    ? {
      title: "Window too small for runtime surface.",
      detail: "Widen the terminal to adjust live runtime posture.",
      width: stdoutWidth,
      height: stdoutHeight,
      minWidth,
      minHeight,
    }
    : null;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusedAreaIndex, setFocusedAreaIndex] = useState(0);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const [selectedStationEntryIndex, setSelectedStationEntryIndex] = useState(0);
  const [runtimeState, setRuntimeState] = useState(() => ({
    shadowMode: Boolean(options.shadowMode),
    ambientTrust: Boolean(options.ambientTrust),
    verbose: Boolean(options.verbose),
  }));
  const palette = usePaletteController({ paletteOptions: { ...options, ...runtimeState }, onLaunch, onExit });
  const liveRuntime = Boolean(options.liveRuntime) && typeof onApply === "function";
  const stationEntries = useMemo(
    () => (view.sections || []).flatMap((section, sectionIndex) => (section.entries || [])
      .filter((entry) => Array.isArray(entry?.argv) && entry.argv.length)
      .map((entry) => ({
        ...entry,
        label: String(entry.label || "").trim(),
        argv: entry.argv,
        sectionIndex,
      }))),
    [view.sections],
  );
  const stationSectionGroups = useMemo(
    () => (view.sections || []).map((section, sectionIndex) => ({
      label: section.label,
      sectionIndex,
      indices: stationEntries
        .map((entry, entryIndex) => (entry.sectionIndex === sectionIndex ? entryIndex : null))
        .filter((entryIndex) => Number.isInteger(entryIndex)),
    })).filter((section) => section.indices.length),
    [stationEntries, view.sections],
  );
  const selectedStationEntry = stationEntries[selectedStationEntryIndex] || stationEntries[0] || null;
  const activeStationSectionIndex = useMemo(() => {
    const foundIndex = stationSectionGroups.findIndex((section) => section.indices.includes(selectedStationEntryIndex));
    return foundIndex >= 0 ? foundIndex : 0;
  }, [selectedStationEntryIndex, stationSectionGroups]);
  const runtimeFocusAreas = ["runtime", ...(stationEntries.length ? ["station"] : []), "actions"];
  const focusedArea = runtimeFocusAreas[focusedAreaIndex] || "runtime";
  const homeArgv = Array.isArray(navigation.homeArgv) ? navigation.homeArgv : [];
  const backArgv = Array.isArray(navigation.backArgv) ? navigation.backArgv : null;

  useEffect(() => {
    setSelectedStationEntryIndex((current) => Math.max(0, Math.min(current, Math.max(0, stationEntries.length - 1))));
  }, [stationEntries.length]);

  const toggleSelected = () => {
    const selected = view.runtimeOptions?.[selectedIndex];
    if (!selected?.key) return;
    setRuntimeState((current) => ({ ...current, [selected.key]: !current[selected.key] }));
  };

  useInput((input, key) => {
    if (palette.handlePaletteInput(input, key)) return;
    if (input === ":" || input === "/") {
      palette.openPalette("");
      return;
    }
    if (input === "h" || input === "H" || input === "w" || input === "W") {
      onLaunch?.(homeArgv);
      return;
    }
    if (guard) {
      if ((key.ctrl && input === "c") || key.return || key.escape || input === "q") onExit?.();
      return;
    }
    if (key.tab || input === "\t" || input === "\u001b[Z") {
      const delta = key.shift || input === "\u001b[Z" ? -1 : 1;
      setFocusedAreaIndex((current) => (((current + delta) % runtimeFocusAreas.length) + runtimeFocusAreas.length) % runtimeFocusAreas.length);
      return;
    }
    if (focusedArea === "runtime") {
      if (key.upArrow) {
        setSelectedIndex((current) => (current === 0 ? (view.runtimeOptions?.length || 1) - 1 : current - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((current) => ((current + 1) % Math.max(1, view.runtimeOptions?.length || 1)));
        return;
      }
      if (key.leftArrow || key.rightArrow || input === " " || key.return) {
        toggleSelected();
        return;
      }
    }
    if (focusedArea === "station") {
      if (key.upArrow || key.leftArrow) {
        setSelectedStationEntryIndex((current) => (current === 0 ? stationEntries.length - 1 : current - 1));
        return;
      }
      if (key.downArrow || key.rightArrow) {
        setSelectedStationEntryIndex((current) => (current + 1) % Math.max(1, stationEntries.length || 1));
        return;
      }
      if (key.return && selectedStationEntry?.argv?.length) {
        onLaunch?.(selectedStationEntry.argv);
        return;
      }
    }
    if (focusedArea === "actions") {
      if (key.leftArrow || key.upArrow) {
        setSelectedActionIndex((current) => (current === 0 ? 1 : 0));
        return;
      }
      if (key.rightArrow || key.downArrow) {
        setSelectedActionIndex((current) => (current === 0 ? 1 : 0));
        return;
      }
      if (key.return || input === "a") {
        if (selectedActionIndex === 0) {
          if (liveRuntime) onApply?.(runtimeState);
          else onLaunch?.(view.buildServeArgv(runtimeState));
        } else if (backArgv?.length) {
          onLaunch?.(backArgv);
        } else {
          onExit?.();
        }
        return;
      }
    }
    if ((key.escape || input === "b" || input === "B") && backArgv && backArgv.length) {
      onLaunch?.(backArgv);
      return;
    }
    if ((key.ctrl && input === "c") || input === "q") onExit?.();
  });

  if (guard) {
    return React.createElement(
      Box,
      { flexDirection: "column", paddingX: theme.screenPaddingX, paddingY: theme.screenPaddingY },
      React.createElement(ViewportGuardCard, { guard }),
    );
  }

  const hero = theme.reduced
    ? { ...view.hero, lines: sliceAdaptiveLines(view.hero?.lines || [], theme.heroLineLimit) }
    : view.hero;
  const previewLines = (view.buildServeCommandLines(runtimeState) || []).slice(0, theme.minimal ? 2 : theme.compact ? 4 : undefined);
  const primarySurfaceSection = focusedArea === "station" && stationSectionGroups[activeStationSectionIndex]
    ? view.sections?.[stationSectionGroups[activeStationSectionIndex].sectionIndex]
    : view.sections?.[0];

  return React.createElement(ScreenFrame, {
    theme,
    hero: React.createElement(WelcomeHeroBanner, {
      hero,
      width: stdoutWidth,
      compactVertical: theme.compactVertical,
      minimal: theme.minimal,
    }),
    footer: view.footer || [],
    hotkeys: backArgv?.length
      ? theme.reduced
        ? `Tab focus · Esc/b back · h home · ↑/↓ choose · Enter ${focusedArea === "runtime" ? "toggle" : focusedArea === "station" ? "open" : liveRuntime ? "apply-live" : "apply"} · q close · : palette`
        : `Tab focus · Esc/b back · h home · ↑/↓ choose · ←/→ toggle/open · Enter ${focusedArea === "runtime" ? "toggle" : focusedArea === "station" ? "open" : liveRuntime ? "apply-live" : "apply"} · q close`
      : theme.reduced
        ? `Tab focus · h home · ↑/↓ choose · Enter ${focusedArea === "runtime" ? "toggle" : focusedArea === "station" ? "open" : liveRuntime ? "apply-live" : "apply"} · q close · : palette`
        : `Tab focus · h home · ↑/↓ choose · ←/→ toggle/open · Enter ${focusedArea === "runtime" ? "toggle" : focusedArea === "station" ? "open" : liveRuntime ? "apply-live" : "apply"} · q close`,
    actionBarItems: [
      backArgv?.length ? { label: "Back", active: true } : null,
      { label: "Home", active: true },
      focusedArea === "runtime"
        ? { label: "Toggle", active: true, focused: true }
        : focusedArea === "station"
          ? { label: "Open lane", active: true, focused: true }
          : { label: liveRuntime ? "Apply live" : "Apply", active: true, focused: true },
      { label: selectedActionIndex === 1 ? "Cancel" : backArgv?.length ? "Back" : "Close", active: false, focused: focusedArea === "actions" && selectedActionIndex === 1 },
    ],
    paletteOpen: palette.paletteOpen,
    paletteNode: React.createElement(CommandPalette, { value: palette.paletteValue, message: palette.paletteMessage, minimal: theme.minimal }),
  },
  React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Box,
      { flexDirection: theme.reduced ? "column" : view.twoColumn ? "row" : "column", columnGap: theme.reduced ? 0 : view.twoColumn ? 1 : 0 },
      React.createElement(
        Box,
        { width: !theme.reduced && view.twoColumn ? Math.max(32, Math.floor((stdoutWidth - 5) / 2)) : "100%", flexGrow: !theme.reduced && view.twoColumn ? 1 : 0 },
        React.createElement(
          InfoCard,
          { label: "Runtime", borderColor: "gray", compactVertical: theme.compactVertical, minimal: theme.minimal, focused: focusedArea === "runtime", width: "100%" },
          ...((view.runtimeOptions || []).map((option, index) => React.createElement(RuntimeOptionRow, {
            key: option.key,
            option: { ...option, enabled: runtimeState[option.key] },
            selected: index === selectedIndex,
            focused: focusedArea === "runtime",
          }))),
        ),
      ),
      React.createElement(
        Box,
        { width: !theme.reduced && view.twoColumn ? Math.max(32, Math.floor((stdoutWidth - 5) / 2)) : "100%", flexGrow: !theme.reduced && view.twoColumn ? 1 : 0 },
        theme.minimal ? null : React.createElement(SurfaceSectionCard, {
          section: primarySurfaceSection,
          width: stdoutWidth,
          compactVertical: theme.compactVertical,
          minimal: false,
          interactive: focusedArea === "station",
          focused: focusedArea === "station",
          selectedLabel: focusedArea === "station" ? selectedStationEntry?.label || "" : "",
        }),
        React.createElement(
          InfoCard,
          { label: "Command preview", borderColor: "gray", compactVertical: theme.compactVertical, minimal: theme.minimal, width: "100%" },
          ...previewLines.map((line, index) => React.createElement(Text, { key: `runtime-preview-${index}` }, line)),
          React.createElement(Text, { color: "gray", dimColor: true }, view.applyLine),
        ),
      ),
    ),
    theme.reduced
      ? null
      : (view.sections || []).filter((section) => section !== primarySurfaceSection).map((section, index) => React.createElement(SurfaceSectionCard, {
        key: `runtime-section-${section.label}-${index}`,
        section,
        width: stdoutWidth,
        interactive: focusedArea === "station",
        focused: focusedArea === "station" && stationSectionGroups[activeStationSectionIndex]?.sectionIndex === (view.sections || []).indexOf(section),
        selectedLabel: focusedArea === "station" ? selectedStationEntry?.label || "" : "",
      })),
    React.createElement(
      Box,
      { marginTop: theme.compactVertical ? 0 : 1, marginBottom: theme.compactVertical ? 0 : 1, flexWrap: "wrap", flexDirection: "row" },
      React.createElement(ActionChip, { label: liveRuntime ? "Apply live" : "Apply", active: selectedActionIndex === 0, focused: focusedArea === "actions" && selectedActionIndex === 0 }),
      React.createElement(ActionChip, { label: backArgv?.length ? "Back" : "Cancel", active: selectedActionIndex === 1, focused: focusedArea === "actions" && selectedActionIndex === 1 }),
    ),
    React.createElement(
      CompactStateNote,
      { theme },
      theme.minimal
        ? stationEntries.length
          ? "This view keeps live toggles in reach; Tab into the station to open a hot lane directly."
          : "This view keeps live toggles in reach; deeper station detail returns in a taller window."
        : theme.reduced ? stationEntries.length ? "Compact runtime keeps live toggles first, but you can still Tab into the station and open a hot lane." : "Compact runtime keeps the live controls and command preview in view first." : "",
    ),
  ));
}

function actionSupportCopy(label = "") {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "block") return "Keep this request stopped before anything clears.";
  if (normalized === "tighten mandate") return "Turn this stop into a narrower future boundary.";
  if (normalized === "approve once") return "Allow one reviewed exception while keeping the lane under scrutiny.";
  if (normalized === "let action clear") return "Current mandate already clears this lane.";
  return "Choose the next operator action for this lane.";
}

function actionPriorityHint(label = "", blocked = false) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!blocked) return "This lane already clears under the active boundary.";
  if (normalized === "tighten mandate") return "Best operator move after a real stop: make the next pass stricter, not just louder.";
  return "Tighten mandate is the durable follow-up when you want this stop to improve the next pass too.";
}

function reasonCategoryLabel(category = "") {
  if (category === "policy_lane") return "Policy lane";
  if (category === "tool_gate") return "Tool gate";
  if (category === "scope_gate") return "Scope gate";
  if (category === "spend_gate") return "Spend gate";
  if (category === "review_gate") return "Review gate";
  if (category === "outbound_gate") return "Outbound gate";
  if (category === "risk_gate") return "Risk gate";
  return "Decision detail";
}

function resolutionHeadline(operatorAction = "") {
  const normalized = String(operatorAction || "").trim().toLowerCase();
  if (normalized === "tighten mandate") return "Boundary tightened for the next pass.";
  if (normalized === "approve once") return "One reviewed exception cleared.";
  if (normalized === "block") return "Lane stayed stopped.";
  return "Resolution recorded.";
}

function HeroBanner({ session, verdictColor, screenshotMode = false, compactVertical = false, minimal = false, operatorAction = "" }) {
  const blocked = session.decision.status === "blocked" && !operatorAction;
  const statusWord = operatorAction
    ? String(operatorAction || "").toUpperCase()
    : blocked
      ? "STOP"
      : "CLEAR";
  const kicker = operatorAction
    ? "RESOLUTION"
    : blocked
      ? "HIGH-RISK ACTION"
      : "POLICY DECISION";
  const headline = operatorAction
    ? resolutionHeadline(operatorAction)
    : blocked
      ? "Dangerous action held before it becomes real."
      : "Current mandate clears this lane.";
  const subhead = operatorAction
    ? session.statusLine
    : blocked
      ? "Blocked pending human decision under the active mandate."
      : "Consequential action judged under the active mandate.";

  if (minimal) {
    return React.createElement(
      Box,
      { flexDirection: "column", marginBottom: compactVertical ? 0 : 1 },
      React.createElement(
        Box,
        { justifyContent: "space-between", flexDirection: "row" },
        React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "NORNR SENTRY"),
        React.createElement(Text, { color: verdictColor, bold: true }, statusWord),
      ),
      React.createElement(Text, { color: "white", bold: true }, headline),
      React.createElement(Text, { color: "gray", dimColor: true }, `Client ${session.adapter.clientLabel} · ${session.intent.actionClass}`),
    );
  }

  return React.createElement(
    Box,
    {
      borderStyle: "single",
      borderColor: verdictColor,
      paddingX: 2,
      paddingY: compactVertical ? 0 : 1,
      marginBottom: compactVertical ? 0 : 1,
      flexDirection: "column",
    },
    React.createElement(
      Box,
      { justifyContent: "space-between", flexDirection: screenshotMode ? "row" : "row", marginBottom: 1 },
      React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "NORNR SENTRY"),
      React.createElement(Text, { color: verdictColor, bold: true }, screenshotMode ? `${statusWord} / ${session.intent.actionClass.toUpperCase()}` : statusWord),
    ),
    React.createElement(Text, { color: "gray", dimColor: true, bold: true }, kicker),
    React.createElement(Text, { color: verdictColor, bold: true }, statusWord),
    React.createElement(Text, { color: "white", bold: true }, headline),
    React.createElement(Text, { color: "gray", dimColor: true }, subhead),
    React.createElement(Text, { color: "gray", dimColor: true }, `Client ${session.adapter.clientLabel} | Action class ${session.intent.actionClass}`),
  );
}

function DecisionPriorityCard({ session, verdictColor, screenshotMode = false, compactVertical = false, minimal = false, focused = false, width = undefined }) {
  const reasons = session.decision.primaryReason
    ? [session.decision.primaryReason, ...((session.decision.reasons || []).slice(1))]
    : (session.decision.reasons || []);
  const primaryReason = reasons[0] || session.decision.primaryReason || "Current mandate allows this lane.";
  const reasonDetails = (session.decision.reasonDetails || [])
    .slice(0, minimal ? 1 : screenshotMode ? 2 : 3)
    .map((detail) => `${reasonCategoryLabel(detail.category)}: ${detail.message}`);
  const secondaryReasons = reasons
    .slice(1)
    .map((reason) => String(reason || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((reason, index, items) => items.indexOf(reason) === index)
    .slice(0, Math.max(0, (minimal ? 1 : screenshotMode ? 1 : 2) - reasonDetails.length));
  const blocked = session.decision.status === "blocked";
  const noteColor = blocked ? "yellow" : "green";

  return React.createElement(
    InfoCard,
    { label: blocked ? "Stop reason" : "Decision", borderColor: verdictColor, screenshotMode, compactVertical, minimal, focused, focusColor: verdictColor, width },
    React.createElement(Text, { color: verdictColor, bold: true }, primaryReason),
    ...reasonDetails.map((reason, index) => React.createElement(Text, { key: `reason-detail-${index}`, color: "gray", dimColor: true }, `• ${reason}`)),
    ...secondaryReasons.map((reason, index) => React.createElement(Text, { key: `secondary-reason-${index}`, color: "gray", dimColor: true }, `• ${reason}`)),
    minimal
      ? React.createElement(Text, { color: noteColor, bold: blocked }, blocked ? "Decide now: block, tighten or approve once." : "Action clears under the current boundary.")
      : React.createElement(
        React.Fragment,
        null,
        React.createElement(Text, { color: noteColor, bold: blocked }, blocked ? "WHAT NOW" : "NEXT"),
        React.createElement(
          Text,
          { color: blocked ? "white" : "gray", dimColor: !blocked },
          blocked
            ? "Choose Block now, Tighten mandate for the next pass, or Approve once for a single reviewed exception."
            : "Let the action clear under the current boundary or keep observing the lane in shadow mode.",
        ),
      ),
  );
}

function BoundaryDetailsCard({ session, screenshotMode = false, compactVertical = false, minimal = false, wideLayout = false }) {
  const lineageLabel = formatLineage(session.intent.lineage);
  return React.createElement(
    InfoCard,
    { label: "Boundary details", borderColor: "gray", screenshotMode, compactVertical, minimal, width: "100%" },
    React.createElement(
      Box,
      { flexDirection: wideLayout ? "row" : "column" },
      React.createElement(
        Box,
        { flexDirection: "column", flexGrow: 1, marginRight: wideLayout ? 2 : 0, marginBottom: wideLayout ? 0 : 1 },
        React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "INTENT"),
        React.createElement(Text, { bold: true }, formatIntentTitle(session.intent, screenshotMode)),
        React.createElement(DetailRow, { label: "Tool", value: session.intent.tool, screenshotMode }),
        React.createElement(DetailRow, { label: "Target", value: session.intent.target, screenshotMode }),
        lineageLabel ? React.createElement(DetailRow, { label: "Lineage", value: lineageLabel, screenshotMode, multiline: screenshotMode }) : null,
        session.intent.counterparty
          ? React.createElement(DetailRow, { label: "Counterparty", value: session.intent.counterparty, screenshotMode, multiline: screenshotMode })
          : null,
      ),
      React.createElement(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        React.createElement(Text, { color: "gray", dimColor: true, bold: true }, "MANDATE"),
        React.createElement(DetailRow, { label: "Owner", value: session.mandate.ownerId, screenshotMode }),
        React.createElement(DetailRow, {
          label: "Write scope",
          value: formatScopeList(session.mandate.paths.write || [], screenshotMode),
          screenshotMode,
          multiline: screenshotMode,
        }),
        session.projectScope?.rootDir
          ? React.createElement(DetailRow, {
            label: "Project scope",
            value: formatScopeValue(session.projectScope.rootDir, screenshotMode),
            screenshotMode,
            multiline: screenshotMode,
          })
          : null,
        React.createElement(DetailRow, {
          label: "Spend threshold",
          value: `$${session.mandate.limits.spendUsdAbove}`,
          screenshotMode,
        }),
      ),
    ),
  );
}

function ActionSelectionCard({ actions = [], selectedIndex = 0, screenshotMode = false, compactVertical = false, minimal = false, focused = false, blocked = false }) {
  const selectedAction = actions[selectedIndex] || actions[0] || "";
  const tone = resolveActionTone(selectedAction);
  const borderColor = tone === "critical" ? "red" : tone === "caution" ? "yellow" : tone === "positive" ? "green" : "gray";
  const noteColor = tone === "critical" ? "red" : tone === "caution" ? "yellow" : tone === "positive" ? "green" : "white";

  return React.createElement(
    InfoCard,
    { label: "Next action", borderColor, screenshotMode, compactVertical, minimal, focused, focusColor: borderColor === "gray" ? "white" : borderColor, width: "100%" },
    React.createElement(Text, { color: noteColor, bold: true }, selectedAction || "Choose an operator action."),
    minimal
      ? React.createElement(Text, { color: "gray", dimColor: true }, blocked ? "b Block · t Tighten · a Approve once · Enter confirm · q close" : "Enter confirm · q close")
      : React.createElement(React.Fragment, null,
        React.createElement(Text, null, actionSupportCopy(selectedAction)),
        blocked
          ? React.createElement(Text, { color: "yellow", bold: tone === "caution" }, actionPriorityHint(selectedAction, blocked))
          : null,
        React.createElement(
          Box,
          { marginTop: compactVertical ? 0 : 1, marginBottom: 0, flexWrap: "wrap", flexDirection: "row" },
          ...actions.map((label, index) => React.createElement(ActionChip, {
            key: label,
            label: screenshotMode ? label : label,
            active: index === selectedIndex,
            focused: focused && index === selectedIndex,
            screenshotMode,
          })),
        ),
        screenshotMode
          ? null
          : React.createElement(Text, { color: "gray", dimColor: true }, "Hotkeys: b block, t tighten, a approve once, Enter confirm, q close"),
      ),
  );
}

function LaneMemoryCard({ session, screenshotMode = false, compactVertical = false, minimal = false }) {
  const laneMemory = session.laneMemory || {};
  const lastEntry = laneMemory.lastEntry || null;
  return React.createElement(
    InfoCard,
    { label: "Lane memory", borderColor: "gray", screenshotMode, compactVertical, minimal, width: "100%" },
    React.createElement(Text, { color: "white", bold: true }, laneMemory.summary || "First defended record for this lane."),
    lastEntry
      ? React.createElement(Text, { color: "gray", dimColor: true }, `Latest prior: ${String(lastEntry.recordedAt || "").slice(0, 19).replace("T", " ")} · ${lastEntry.status}${lastEntry.operatorAction ? ` · ${lastEntry.operatorAction}` : ""}`)
      : React.createElement(Text, { color: "gray", dimColor: true }, "No earlier defended record for this action class."),
    laneMemory.totalPrior
      ? React.createElement(Text, { color: "gray", dimColor: true }, `Blocked ${laneMemory.counts?.blocked || 0} · Tighten ${laneMemory.counts?.tighten_mandate || 0} · Approve once ${laneMemory.counts?.approved_once || 0}`)
      : null,
    !minimal && lastEntry?.reason ? React.createElement(Text, { color: "gray", dimColor: true }, lastEntry.reason) : null,
  );
}

function RecordArtifactCard({ session, screenshotMode = false, compactVertical = false, minimal = false, resolved = false }) {
  const auditSignal = formatAuditSignal(session);
  return React.createElement(
    InfoCard,
    { label: "Defended record", borderColor: "white", screenshotMode, compactVertical, minimal, width: "100%" },
    React.createElement(Text, { color: "white", bold: true }, resolved ? "Defended record captured for this lane." : "Defended record already staged for this lane."),
    React.createElement(
      Text,
      { color: "gray", dimColor: true },
      resolved
        ? "Portable export and share pack are ready for review, replay and audit."
        : "The operator decision will finalize the verdict and refresh the proof exports.",
    ),
    auditSignal ? React.createElement(Text, { color: screenshotMode ? "white" : "gray", dimColor: !screenshotMode }, auditSignal) : null,
    screenshotMode ? React.createElement(Text, null, resolved ? "Share-ready proof is available for the resolved lane." : "Audit residue is already attached to this lane before the operator resolves it.") : null,
    !screenshotMode ? React.createElement(Text, null, session.record.filePath) : null,
    !screenshotMode && session.record.portablePath ? React.createElement(Text, { color: "gray" }, `Portable record: ${session.record.portablePath}`) : null,
    !screenshotMode && session.record.sharePath ? React.createElement(Text, { color: "gray" }, `Share pack: ${session.record.sharePath}`) : null,
  );
}

function ResolutionSummaryCard({ session, operatorAction, screenshotMode = false, compactVertical = false, minimal = false }) {
  const tone = resolveActionTone(operatorAction);
  const borderColor = tone === "critical" ? "red" : tone === "caution" ? "yellow" : tone === "positive" ? "green" : "gray";
  const headlineColor = tone === "critical" ? "red" : tone === "caution" ? "yellow" : tone === "positive" ? "green" : "white";
  return React.createElement(
    InfoCard,
    { label: "Resolution", borderColor, screenshotMode, compactVertical, minimal, width: "100%" },
    React.createElement(Text, { color: headlineColor, bold: true }, resolutionHeadline(operatorAction)),
    minimal
      ? React.createElement(Text, { color: "gray", dimColor: true }, session.statusLine)
      : React.createElement(React.Fragment, null,
        React.createElement(Text, null, actionSupportCopy(operatorAction)),
        React.createElement(Text, { color: "gray", dimColor: true }, session.statusLine),
        operatorAction === "Tighten mandate"
          ? React.createElement(Text, { color: "yellow", bold: true }, "The stop now carries a concrete boundary update instead of ending as terminal drama.")
          : null,
      ),
  );
}

function MandateSuggestionCard({ session, screenshotMode = false, compactVertical = false, minimal = false }) {
  const suggestion = session.mandateSuggestion;
  if (!suggestion) return null;
  const previewLines = (suggestion.diffLines || []).slice(0, screenshotMode ? 4 : 6);

  return React.createElement(
    InfoCard,
    { label: "Tighten mandate", borderColor: "yellow", screenshotMode, compactVertical, minimal, width: "100%" },
    React.createElement(Text, { color: "yellow", bold: true }, suggestion.summary),
    React.createElement(Text, { color: "gray", dimColor: true }, "Proposed boundary change"),
    suggestion.mandatePath ? React.createElement(DetailRow, { label: "Local mandate", value: suggestion.mandatePath, screenshotMode, multiline: screenshotMode }) : null,
    React.createElement(DetailRow, { label: "Block tool", value: (suggestion.patch.tools?.blocked || []).join(", "), screenshotMode, multiline: screenshotMode }),
    React.createElement(DetailRow, { label: "Block classes", value: (suggestion.patch.limits?.blockedActionClasses || []).join(", "), screenshotMode, multiline: screenshotMode }),
    ...previewLines.map((line, index) => React.createElement(Text, { key: `mandate-diff-${index}`, color: "gray" }, line)),
  );
}

export function SentryApp({ session, onResolve, onExit }) {
  const actions = session.decision.nextActions || [];
  const blocked = session.decision.status === "blocked";
  const [selectedIndex, setSelectedIndex] = useState(() => blockedDefaultIndex(actions, blocked));
  const [resolved, setResolved] = useState(false);
  const screenshotMode = Boolean(session.runtime?.screenshotMode);
  const recordingMode = Boolean(session.runtime?.recordingMode);
  const stdoutWidth = Number(process.stdout?.columns || 120);
  const stdoutHeight = Number(process.stdout?.rows || 40);
  const theme = createAdaptiveTheme({ width: stdoutWidth, height: stdoutHeight, screenshotMode, panel: "surface" });
  const viewportGuard = getSentryViewportGuard({ width: stdoutWidth, height: stdoutHeight, screenshotMode });
  const narrowLayout = stdoutWidth < 74;
  const stagedReveal = screenshotMode && recordingMode;
  const [revealStep, setRevealStep] = useState(stagedReveal ? 1 : 5);
  const stopFocusAreas = ["reason", "actions"];
  const [focusedAreaIndex, setFocusedAreaIndex] = useState(1);
  const focusedArea = stopFocusAreas[focusedAreaIndex] || "actions";

  const actionHotkeys = useMemo(
    () => ({
      a: "Approve once",
      b: "Block",
      t: "Tighten mandate",
    }),
    [],
  );

  useInput((input, key) => {
    if (resolved) return;
    if (key.tab || input === "\t" || input === "\u001b[Z") {
      const delta = key.shift || input === "\u001b[Z" ? -1 : 1;
      setFocusedAreaIndex((current) => (((current + delta) % stopFocusAreas.length) + stopFocusAreas.length) % stopFocusAreas.length);
      return;
    }
    if (focusedArea === "actions") {
      if (key.leftArrow || key.upArrow) {
        setSelectedIndex((current) => (current === 0 ? actions.length - 1 : current - 1));
        return;
      }
      if (key.rightArrow || key.downArrow) {
        setSelectedIndex((current) => (current + 1) % actions.length);
        return;
      }
      if (key.return) {
        const label = actions[selectedIndex] || "Block";
        setResolved(true);
        onResolve?.(label);
        return;
      }
    }
    if (focusedArea === "reason" && key.return) {
      setFocusedAreaIndex(1);
      return;
    }
    if (input && actionHotkeys[input]) {
      setResolved(true);
      onResolve?.(actionHotkeys[input]);
      return;
    }
    if (key.escape || input === "q" || (key.ctrl && input === "c")) {
      setResolved(true);
      onExit?.();
    }
  });

  useEffect(() => {
    if (screenshotMode && process.stdout?.isTTY) {
      process.stdout.write("\u001b[2J\u001b[3J\u001b[H");
    }
  }, [screenshotMode]);

  useEffect(() => {
    if (!stagedReveal) {
      setRevealStep(5);
      return undefined;
    }
    setRevealStep(1);
    const timers = [
      setTimeout(() => setRevealStep(2), 100),
      setTimeout(() => setRevealStep(3), 200),
      setTimeout(() => setRevealStep(4), 300),
      setTimeout(() => setRevealStep(5), 400),
    ];
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [stagedReveal, session.intent?.actionClass, session.decision?.status]);

  const verdictColor = blocked ? "red" : "green";

  if (viewportGuard) {
    return React.createElement(
      Box,
      { flexDirection: "column", paddingX: theme.screenPaddingX, paddingY: theme.screenPaddingY },
      React.createElement(ViewportGuardCard, { guard: viewportGuard, screenshotMode }),
    );
  }

  return React.createElement(ScreenFrame, {
    theme,
    hero: revealStep >= 1 ? React.createElement(HeroBanner, {
      session,
      verdictColor,
      screenshotMode,
      compactVertical: theme.compactVertical,
      minimal: theme.minimal,
    }) : null,
    footer: [],
    hotkeys: screenshotMode
      ? ""
      : theme.reduced
        ? "Tab focus · b block · t tighten · a approve once · Enter confirm · q close"
        : "Tab focus · ←/→ or ↑/↓ choose · b block · t tighten · a approve once · Enter confirm · q close",
    actionBarItems: [
      { label: focusedArea === "reason" ? "Reason" : "Actions", active: true, focused: true },
      { label: actions[selectedIndex] || "Confirm", active: true },
      { label: "Close", active: false },
    ],
    paletteOpen: false,
    paletteNode: null,
  },
  React.createElement(
    React.Fragment,
    null,
    revealStep >= 2 ? React.createElement(DecisionPriorityCard, { session, verdictColor, screenshotMode, compactVertical: theme.compactVertical, minimal: theme.minimal, focused: focusedArea === "reason", width: "100%" }) : null,
    revealStep >= 3 ? React.createElement(ActionSelectionCard, { actions, selectedIndex, screenshotMode, compactVertical: theme.compactVertical, minimal: theme.minimal, focused: focusedArea === "actions", blocked }) : null,
    revealStep >= 4 && !theme.reduced ? React.createElement(BoundaryDetailsCard, { session, screenshotMode, compactVertical: false, minimal: false, wideLayout: !narrowLayout }) : null,
    revealStep >= 5 && !theme.reduced ? React.createElement(LaneMemoryCard, { session, screenshotMode, compactVertical: false, minimal: false }) : null,
    revealStep >= 5 && !theme.reduced ? React.createElement(RecordArtifactCard, { session, screenshotMode, compactVertical: false, minimal: false, resolved: false }) : null,
    React.createElement(
      CompactStateNote,
      { theme },
      theme.minimal
        ? "This view keeps the stop reason and next action visible first; evidence returns in a taller window."
        : theme.reduced ? "Compact stop screen keeps the reason and operator choice anchored at the top." : "",
    ),
  ));
}

export function SentryResolvedApp({ session, operatorAction }) {
  const verdictColor = operatorAction === "Approve once" ? "green" : operatorAction === "Tighten mandate" ? "yellow" : "red";
  const screenshotMode = Boolean(session.runtime?.screenshotMode);
  const stdoutWidth = Number(process.stdout?.columns || 120);
  const stdoutHeight = Number(process.stdout?.rows || 40);
  const theme = createAdaptiveTheme({ width: stdoutWidth, height: stdoutHeight, screenshotMode, panel: "surface" });
  const viewportGuard = getSentryViewportGuard({ width: stdoutWidth, height: stdoutHeight, screenshotMode });

  useEffect(() => {
    if (screenshotMode && process.stdout?.isTTY) {
      process.stdout.write("\u001b[2J\u001b[3J\u001b[H");
    }
  }, [screenshotMode]);

  if (viewportGuard) {
    return React.createElement(
      Box,
      { flexDirection: "column", paddingX: theme.screenPaddingX, paddingY: theme.screenPaddingY },
      React.createElement(ViewportGuardCard, { guard: viewportGuard, screenshotMode }),
    );
  }

  return React.createElement(ScreenFrame, {
    theme,
    hero: React.createElement(HeroBanner, {
      session,
      verdictColor,
      screenshotMode,
      compactVertical: theme.compactVertical,
      minimal: theme.minimal,
      operatorAction,
    }),
    footer: [],
    hotkeys: screenshotMode ? "" : theme.reduced ? "Enter/q close" : "Enter/q close",
    actionBarItems: [],
    paletteOpen: false,
    paletteNode: null,
  },
  React.createElement(
    React.Fragment,
    null,
    React.createElement(ResolutionSummaryCard, { session, operatorAction, screenshotMode, compactVertical: theme.compactVertical, minimal: theme.minimal }),
    !theme.reduced ? React.createElement(MandateSuggestionCard, { session, screenshotMode, compactVertical: false, minimal: false }) : null,
    !theme.reduced ? React.createElement(LaneMemoryCard, { session, screenshotMode, compactVertical: false, minimal: false }) : null,
    !theme.reduced ? React.createElement(RecordArtifactCard, { session, screenshotMode, compactVertical: false, minimal: false, resolved: true }) : null,
    React.createElement(
      CompactStateNote,
      { theme },
      theme.minimal
        ? "This view keeps the outcome visible first; mandate diffs and defended proof return in a taller window."
        : theme.reduced ? "Compact resolution keeps the outcome readable without pushing defended proof below the fold." : "",
    ),
  ));
}
