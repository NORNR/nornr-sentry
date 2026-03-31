import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PACKAGE_NAME = "nornr-sentry";
const DEFAULT_REGISTRY_BASE_URL = "https://registry.npmjs.org";
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DISABLE_ENV_KEYS = [
  "NORNR_SENTRY_DISABLE_UPDATE_CHECK",
  "NO_UPDATE_NOTIFIER",
  "CI",
];

let updateCheckStarted = false;
let updateNoticePrinted = false;

function normalizeVersionParts(version = "") {
  const normalized = String(version ?? "").trim();
  if (!normalized) return [];
  return normalized
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const match = String(part).match(/^(\d+)/);
      return match ? Number(match[1]) : 0;
    });
}

export function compareSentryVersions(left = "", right = "") {
  const leftParts = normalizeVersionParts(left);
  const rightParts = normalizeVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function shouldSkipUpdateCheck(env = process.env) {
  return DISABLE_ENV_KEYS.some((key) => {
    const value = String(env?.[key] ?? "").trim().toLowerCase();
    return value === "1" || value === "true";
  });
}

function resolveRegistryLatestUrl(baseUrl = DEFAULT_REGISTRY_BASE_URL, packageName = PACKAGE_NAME) {
  const normalizedBase = String(baseUrl || DEFAULT_REGISTRY_BASE_URL).replace(/\/+$/, "");
  return `${normalizedBase}/${encodeURIComponent(packageName)}/latest`;
}

function resolveCachePath(packageName = PACKAGE_NAME) {
  return path.join(os.tmpdir(), `${packageName}-update-check.json`);
}

function formatShellArg(value = "") {
  const normalized = String(value ?? "");
  if (!normalized) return "''";
  if (/^[A-Za-z0-9_./:@=-]+$/.test(normalized)) return normalized;
  return `'${normalized.replace(/'/g, `'\\''`)}'`;
}

function buildOneOffCommand(argv = []) {
  if (!Array.isArray(argv) || !argv.length) return "npx nornr-sentry@latest --first-stop";
  return `npx nornr-sentry@latest ${argv.map((token) => formatShellArg(token)).join(" ")}`;
}

export function buildSentryUpdateNotice({
  currentVersion = "",
  latestVersion = "",
  argv = [],
} = {}) {
  const current = String(currentVersion ?? "").trim();
  const latest = String(latestVersion ?? "").trim();
  if (!current || !latest || compareSentryVersions(latest, current) <= 0) return null;
  return [
    "",
    `Update available for NORNR Sentry: ${current} → ${latest}`,
    "Update your global install:",
    "  npm install -g nornr-sentry@latest",
    "Or run the latest version once:",
    `  ${buildOneOffCommand(argv)}`,
    "",
  ].join("\n");
}

async function readJsonFile(filePath = "") {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath = "", value = {}) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    // Best-effort cache only.
  }
}

async function resolveCurrentPackageVersion() {
  const packageJson = await readJsonFile(new URL("../package.json", import.meta.url));
  return String(packageJson?.version ?? "").trim();
}

export async function checkForSentryCliUpdate({
  currentVersion = "",
  packageName = PACKAGE_NAME,
  registryBaseUrl = process.env.NORNR_SENTRY_NPM_REGISTRY_URL || DEFAULT_REGISTRY_BASE_URL,
  cachePath = resolveCachePath(packageName),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const resolvedCurrentVersion = String(currentVersion || await resolveCurrentPackageVersion()).trim();
  if (!resolvedCurrentVersion || typeof fetchImpl !== "function") {
    return { currentVersion: resolvedCurrentVersion, latestVersion: null, updateAvailable: false, source: "unavailable" };
  }

  const cached = await readJsonFile(cachePath);
  const cachedAt = Number(cached?.checkedAt ?? 0);
  if (cached && now - cachedAt < cacheTtlMs) {
    const latestVersion = String(cached?.latestVersion ?? "").trim() || null;
    return {
      currentVersion: resolvedCurrentVersion,
      latestVersion,
      updateAvailable: latestVersion ? compareSentryVersions(latestVersion, resolvedCurrentVersion) > 0 : false,
      source: "cache",
    };
  }

  try {
    const response = await fetchImpl(resolveRegistryLatestUrl(registryBaseUrl, packageName), {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response?.ok) {
      return { currentVersion: resolvedCurrentVersion, latestVersion: null, updateAvailable: false, source: "error" };
    }
    const payload = await response.json();
    const latestVersion = String(payload?.version ?? "").trim() || null;
    await writeJsonFile(cachePath, {
      checkedAt: now,
      latestVersion,
    });
    return {
      currentVersion: resolvedCurrentVersion,
      latestVersion,
      updateAvailable: latestVersion ? compareSentryVersions(latestVersion, resolvedCurrentVersion) > 0 : false,
      source: "network",
    };
  } catch {
    return { currentVersion: resolvedCurrentVersion, latestVersion: null, updateAvailable: false, source: "error" };
  }
}

export async function maybePrintSentryUpdateNotice({
  argv = [],
  stderr = process.stderr,
  env = process.env,
  ...options
} = {}) {
  if (updateCheckStarted || updateNoticePrinted) return null;
  updateCheckStarted = true;

  try {
    if (shouldSkipUpdateCheck(env) || !stderr?.isTTY) return null;
    const result = await checkForSentryCliUpdate(options);
    const notice = buildSentryUpdateNotice({
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      argv,
    });
    if (!notice) return null;
    stderr.write(notice);
    updateNoticePrinted = true;
    return notice;
  } finally {
    updateCheckStarted = false;
  }
}

export function __resetSentryUpdateNotifierForTests() {
  updateCheckStarted = false;
  updateNoticePrinted = false;
}
