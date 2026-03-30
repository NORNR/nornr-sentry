import path from "node:path";

const SAFE_READ_TOOLS = new Set(["read_file", "search_code", "list_files", "glob_files", "read_directory"]);

function normalizePath(value = "", rootDir = process.cwd()) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return path.normalize(raw);
  return path.resolve(rootDir, raw);
}

function withinScope(targetPath = "", scopePath = "") {
  if (!targetPath || !scopePath) return false;
  if (targetPath === scopePath) return true;
  return targetPath.startsWith(`${scopePath}${path.sep}`);
}

export function buildFastPathAllow(intent = {}, mandate = {}) {
  const tool = String(intent?.tool || "").trim();
  const rootDir = String(mandate?.projectScope?.rootDir || mandate?.context?.projectRoot || mandate?.context?.cwd || process.cwd()).trim();
  const targetPath = normalizePath(intent?.path || "", rootDir);
  const readScopes = (Array.isArray(mandate?.paths?.read) ? mandate.paths.read : [])
    .map((entry) => normalizePath(entry, rootDir))
    .filter(Boolean);
  if (!SAFE_READ_TOOLS.has(tool)) {
    return {
      eligible: false,
      reason: "Tool is not in the conservative read-only fast-path set.",
    };
  }
  if (String(intent?.actionClass || "").trim() !== "read_only") {
    return {
      eligible: false,
      reason: "Action class is not an explicitly read-only lane.",
    };
  }
  if (intent?.destructive || intent?.outbound || Number(intent?.spendUsd || 0) > 0) {
    return {
      eligible: false,
      reason: "Fast-path allow only covers zero-spend, non-destructive, local read intents.",
    };
  }
  if (!targetPath || !readScopes.length || !readScopes.some((scope) => withinScope(targetPath, scope))) {
    return {
      eligible: false,
      reason: "Read path does not sit inside the active project scope.",
    };
  }
  return {
    eligible: true,
    reason: "Read-only intent sits inside the active project scope and does not widen real consequences.",
    targetPath,
  };
}
