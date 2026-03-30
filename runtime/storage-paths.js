import os from "node:os";
import path from "node:path";

import { detectProjectScope } from "./mandate-state.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

export function inferProjectScope(options = {}, projectScope = null) {
  if (projectScope?.rootDir) return projectScope;
  if (options.projectScope?.rootDir) return options.projectScope;
  return detectProjectScope(options.projectRoot || options.cwd || process.cwd()) || null;
}

export function resolveStorageRoot(options = {}, projectScope = null) {
  const resolvedProjectScope = inferProjectScope(options, projectScope);
  if (resolvedProjectScope?.rootDir) return resolvedProjectScope.rootDir;
  if (options.projectRoot) return path.resolve(options.projectRoot);
  return process.cwd();
}

export function resolveRecordRootDir(options = {}, projectScope = null) {
  const explicit = normalizeText(options.recordRootDir || "");
  if (explicit) return path.resolve(explicit);
  return path.join(resolveStorageRoot(options, projectScope), ".nornr", "records");
}

export function formatDisplayPath(candidate = "", options = {}) {
  const raw = normalizeText(candidate);
  if (!raw) return "";

  const homeDir = normalizeText(os.homedir());
  const cwd = normalizeText(options.cwd || process.cwd());
  const projectRoot = normalizeText(
    options.projectScope?.rootDir
      || inferProjectScope(options)?.rootDir
      || options.projectRoot
      || "",
  );
  const resolved = path.resolve(raw);

  if (projectRoot && (resolved === projectRoot || resolved.startsWith(`${projectRoot}${path.sep}`))) {
    const relativeToProject = path.relative(projectRoot, resolved);
    return relativeToProject ? `./${relativeToProject}` : ".";
  }

  if (cwd && (resolved === cwd || resolved.startsWith(`${cwd}${path.sep}`))) {
    const relativeToCwd = path.relative(cwd, resolved);
    return relativeToCwd ? `./${relativeToCwd}` : ".";
  }

  if (homeDir && (resolved === homeDir || resolved.startsWith(`${homeDir}${path.sep}`))) {
    const relativeToHome = path.relative(homeDir, resolved);
    return relativeToHome ? `~/${relativeToHome}` : "~";
  }

  return resolved;
}

export function formatDisplayPathList(values = [], options = {}) {
  const items = (Array.isArray(values) ? values : [])
    .map((value) => formatDisplayPath(value, options))
    .filter(Boolean);
  return items.length ? items.join(", ") : "(none)";
}
