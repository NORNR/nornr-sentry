const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  gray: "\u001b[90m",
  white: "\u001b[97m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
};

function visibleLength(value = "") {
  return String(value || "").replace(/\u001b\[[0-9;]*m/g, "").length;
}

function stripAnsi(value = "") {
  return String(value || "").replace(/\u001b\[[0-9;]*m/g, "");
}

function padLine(value = "", width = 0) {
  const line = String(value || "");
  const missing = Math.max(0, width - visibleLength(line));
  return `${line}${" ".repeat(missing)}`;
}

function normalizeLines(lines = []) {
  return (Array.isArray(lines) ? lines : [lines])
    .flatMap((entry) => String(entry ?? "").split("\n"))
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line, index, items) => line || index === items.length - 1);
}

function terminalContentWidth(fallback = 78) {
  const columns = currentTerminalColumns(fallback);
  return Math.max(28, columns - 8);
}

export function currentTerminalColumns(fallback = 80) {
  const envWidth = Number(process.env.COLUMNS || 0);
  const stdoutWidth = Number(process.stdout?.columns || 0);
  return stdoutWidth || envWidth || fallback;
}

export function terminalDensity(columns = currentTerminalColumns()) {
  if (columns <= 72) return "compact";
  if (columns >= 96) return "wide";
  return "standard";
}

export function terminalDensityFlags(columns = currentTerminalColumns()) {
  const density = terminalDensity(columns);
  return {
    columns,
    density,
    compact: density === "compact",
    wide: density === "wide",
  };
}

export function pickByDensity(variants = {}, density = terminalDensity()) {
  if (density === "compact") return variants.compact ?? variants.standard ?? variants.wide ?? "";
  if (density === "wide") return variants.wide ?? variants.standard ?? variants.compact ?? "";
  return variants.standard ?? variants.wide ?? variants.compact ?? "";
}

function wrapPlainLine(line = "", width = 78) {
  const source = String(line || "");
  if (!source) return [""];
  if (visibleLength(source) <= width) return [source];
  if (/\u001b\[[0-9;]*m/.test(source)) {
    const plain = stripAnsi(source);
    if (visibleLength(plain) <= width) return [source];
    return wrapPlainLine(plain, width);
  }

  const words = source.split(/\s+/).filter(Boolean);
  if (!words.length) return [source.slice(0, width)];

  const lines = [];
  let current = "";

  for (const word of words) {
    if (visibleLength(word) > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let remainder = word;
      while (visibleLength(remainder) > width) {
        lines.push(remainder.slice(0, width));
        remainder = remainder.slice(width);
      }
      current = remainder;
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (visibleLength(candidate) <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [source];
}

function colorize(text = "", ...codes) {
  if (!text) return "";
  return `${codes.join("")}${text}${ANSI.reset}`;
}

function borderColorForTone(tone = "neutral") {
  if (tone === "critical") return ANSI.red;
  if (tone === "caution") return ANSI.yellow;
  if (tone === "positive") return ANSI.green;
  return ANSI.gray;
}

function maybeMuted(line = "") {
  const value = String(line || "");
  if (!value.trim()) return value;
  if (/\u001b\[[0-9;]*m/.test(value)) return value;
  return colorize(value, ANSI.dim, ANSI.gray);
}

export function renderPanel(label = "", lines = [], options = {}) {
  const maxWidth = Math.max(
    Number(options.maxWidth || 0) || 0,
    0,
  ) || terminalContentWidth();
  const body = normalizeLines(lines).flatMap((line) => wrapPlainLine(line, maxWidth));
  const header = String(label || "").trim().toUpperCase();
  const tone = String(options.tone || "neutral").trim() || "neutral";
  const border = borderColorForTone(tone);
  const headerLabel = header ? colorize(header, ANSI.dim, ANSI.gray, ANSI.bold) : "";
  const width = Math.max(
    header.length,
    ...body.map((line) => visibleLength(line)),
    Math.min(Number(options.minWidth || 0), maxWidth),
  );
  const top = `${border}┌${"─".repeat(width + 2)}┐${ANSI.reset}`;
  const bottom = `${border}└${"─".repeat(width + 2)}┘${ANSI.reset}`;
  const rows = [];

  if (header) {
    rows.push(`${border}│${ANSI.reset} ${padLine(headerLabel, width)} ${border}│${ANSI.reset}`);
  }
  for (const line of body) {
    rows.push(`${border}│${ANSI.reset} ${padLine(line, width)} ${border}│${ANSI.reset}`);
  }

  return [top, ...rows, bottom].join("\n");
}

function heroToneForStatus(status = "") {
  const normalized = String(status || "").trim().toUpperCase();
  if (!normalized) return "neutral";
  if (/STOP|BLOCK|ERROR|FAIL|REJECT|DENIED|GUARD/.test(normalized)) return "critical";
  if (/SETUP|TIGHTEN|PENDING|WAIT|REVIEW|RUNTIME/.test(normalized)) return "caution";
  if (/READY|LIVE|LISTENING|CLEAR|APPROVED|SUMMARY/.test(normalized)) return "positive";
  return "neutral";
}

function heroStatusColorForTone(tone = "neutral") {
  if (tone === "critical") return ANSI.red;
  if (tone === "caution") return ANSI.yellow;
  if (tone === "positive") return ANSI.green;
  return ANSI.white;
}

export function renderHero(options = {}) {
  const eyebrow = String(options.eyebrow || "NORNR SENTRY").trim().toUpperCase();
  const status = String(options.status || "").trim().toUpperCase();
  const heroTone = String(options.tone || heroToneForStatus(status)).trim() || "neutral";
  const statusColor = heroStatusColorForTone(heroTone);
  const gap = "    ";
  const rawHeroLine = status ? `${eyebrow}${gap}${status}` : eyebrow;
  const maxWidth = Math.max(Number(options.maxWidth || 0) || 0, 0) || terminalContentWidth();
  const width = Math.max(
    Math.min(visibleLength(rawHeroLine), maxWidth),
    ...normalizeLines(options.lines || []).flatMap((line) => wrapPlainLine(line, maxWidth)).map((line) => visibleLength(line)),
    Math.min(Number(options.minWidth || 0), maxWidth),
  );
  const left = colorize(eyebrow, ANSI.dim, ANSI.gray, ANSI.bold);
  const heroLine = status && visibleLength(rawHeroLine) <= maxWidth
    ? `${left}${" ".repeat(Math.max(1, width - eyebrow.length - status.length))}${colorize(status, ANSI.bold, statusColor)}`
    : left;
  const lines = [
    heroLine,
    ...(status && visibleLength(rawHeroLine) > maxWidth ? [colorize(status, ANSI.bold, statusColor)] : []),
    ...normalizeLines(options.lines || []),
  ];
  return renderPanel("", lines, { minWidth: width, maxWidth, tone: heroTone });
}

export function renderSurface({ hero = null, sections = [], footer = [] } = {}) {
  const parts = [];
  if (hero) parts.push(hero);
  for (const section of sections) {
    if (!section) continue;
    parts.push(renderPanel(section.label, section.lines, { tone: "neutral", ...(section.options || {}) }));
  }
  const footerLines = normalizeLines(footer);
  if (footerLines.length) parts.push(...footerLines.map((line) => maybeMuted(line)));
  return parts.filter(Boolean).join("\n\n");
}
