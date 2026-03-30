import { buildClientAdapter } from "../adapters/clients.js";
import { inspectClientPatchTarget, patchClientConfig } from "./patch-cursor.js";
import { applyMandateInitPlan, inspectMandateInitPlan } from "./mandate-state.js";
import { defaultProtectPresetForShield, protectPresetLabel } from "../mandates/defaults.js";

function normalizeShield(value = "") {
  return String(value || "cursor").trim() || "cursor";
}

export function buildObserveFirstArgv(options = {}) {
  const shield = normalizeShield(options.shield);
  const port = Number(options.port || 4317) || 4317;
  const protectPreset = String(options.protectPreset || defaultProtectPresetForShield(shield)).trim();
  const argv = ["--client", shield, "--serve", "--port", String(port), "--shadow-mode", "--no-upstream"];
  if (protectPreset) argv.push("--protect", protectPreset);
  if (options.ambientTrust) argv.push("--ambient-trust");
  if (options.verbose) argv.push("--verbose");
  return argv;
}

export function buildGuidedSetupArgv(options = {}, setup = null) {
  const shield = normalizeShield(options.shield);
  const port = Number(options.port || 4317) || 4317;
  const protectPreset = String(options.protectPreset || defaultProtectPresetForShield(shield)).trim();
  const argv = ["--client", shield, "--guided-setup", "--port", String(port), "--shadow-mode", "--no-upstream"];
  if (protectPreset) argv.push("--protect", protectPreset);
  const projectRoot = String(setup?.mandate?.projectScope?.rootDir || options.projectRoot || "").trim();
  if (projectRoot) argv.push("--project-root", projectRoot);
  if (options.cursorConfigPath) argv.push("--cursor-config-path", String(options.cursorConfigPath));
  if (options.claudeConfigPath) argv.push("--claude-config-path", String(options.claudeConfigPath));
  if (options.ambientTrust) argv.push("--ambient-trust");
  if (options.verbose) argv.push("--verbose");
  return argv;
}

export function inspectGuidedSetup(options = {}) {
  const shield = normalizeShield(options.shield);
  const patch = inspectClientPatchTarget(shield, options);
  const mandate = inspectMandateInitPlan(shield, options);
  const canPatch = patch.patchSupported && (patch.clientDetected || patch.fileExists || Boolean(options.cursorConfigPath || options.claudeConfigPath));
  const needsPatch = canPatch && !patch.serverPatched;
  const needsMandate = !mandate.exists;
  const recommended = Boolean(mandate.projectScope && (needsPatch || needsMandate));
  return {
    kind: "nornr.sentry.guided_setup.v1",
    shield,
    protectPreset: String(options.protectPreset || defaultProtectPresetForShield(shield)).trim(),
    recommended,
    show: recommended,
    patch: {
      ...patch,
      canPatch,
      needsPatch,
    },
    mandate: {
      ...mandate,
      needsMandate,
    },
    zeroConfigObserve: {
      enabled: true,
      note: "Starts in shadow mode with no upstream relay and no provider key required. Observe-first is watch-only until you deliberately enforce.",
      argv: buildObserveFirstArgv(options),
    },
    argv: buildGuidedSetupArgv(options, {
      mandate,
    }),
  };
}

export async function applyGuidedSetup(options = {}) {
  const setup = inspectGuidedSetup(options);
  let patchResult = null;
  if (setup.patch.canPatch && setup.patch.needsPatch) {
    const adapter = buildClientAdapter(setup.shield, options);
    patchResult = await patchClientConfig(adapter, options);
  }

  let mandateResult = null;
  if (setup.mandate.nextMandate) {
    mandateResult = await applyMandateInitPlan(setup.mandate, options);
  }

  return {
    kind: "nornr.sentry.guided_setup_result.v1",
    shield: setup.shield,
    patchResult,
    mandateResult,
    projectScope: setup.mandate.projectScope || null,
    zeroConfigObserve: setup.zeroConfigObserve,
    serveArgv: buildObserveFirstArgv(options),
    summaryLines: [
      patchResult
        ? `${patchResult.clientLabel} patched into the local boundary.`
        : setup.patch.canPatch
          ? `${setup.patch.clientLabel} was already patched.`
          : `Manual ${setup.patch.clientLabel || "client"} wiring path kept in place.`,
      `Preset focus: ${protectPresetLabel(setup.protectPreset || defaultProtectPresetForShield(setup.shield))}.`,
      mandateResult?.reused
        ? "Existing local mandate kept in place."
        : mandateResult?.created
          ? `Local mandate written for ${setup.mandate.projectScope?.projectName || "this project"}.`
          : "Local mandate review completed.",
      "Observe-first safety: shadow mode is watch-only here, so you can inspect the lane before you ever enforce it.",
      "No provider key or upstream relay is required in this first-run posture.",
      "Next: run one demo stop, open the proof queue, then decide whether to stay in observe mode or serve for real.",
    ],
  };
}
