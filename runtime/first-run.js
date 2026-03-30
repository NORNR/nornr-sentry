import { buildClientAdapter } from "../adapters/clients.js";
import { inspectClientPatchTarget, patchClientConfig } from "./patch-cursor.js";
import { applyMandateInitPlan, inspectMandateInitPlan } from "./mandate-state.js";

function normalizeShield(value = "") {
  return String(value || "cursor").trim() || "cursor";
}

export function buildObserveFirstArgv(options = {}) {
  const shield = normalizeShield(options.shield);
  const port = Number(options.port || 4317) || 4317;
  const argv = ["--client", shield, "--serve", "--port", String(port), "--shadow-mode", "--no-upstream"];
  if (options.ambientTrust) argv.push("--ambient-trust");
  if (options.verbose) argv.push("--verbose");
  return argv;
}

export function buildGuidedSetupArgv(options = {}, setup = null) {
  const shield = normalizeShield(options.shield);
  const port = Number(options.port || 4317) || 4317;
  const argv = ["--client", shield, "--guided-setup", "--port", String(port), "--shadow-mode", "--no-upstream"];
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
      note: "Starts in shadow mode with no upstream relay and no provider key required.",
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
          : "Client patch skipped. Use manual patch if you want a managed client config.",
      mandateResult?.reused
        ? "Existing local mandate kept in place."
        : mandateResult?.created
          ? `Local mandate written for ${setup.mandate.projectScope?.projectName || "this project"}.`
          : "Local mandate review completed.",
      "Boundary starts in shadow mode first. No provider key is required until you configure upstream relay.",
      "Golden path after this: run one demo stop, observe first, then serve for real.",
    ],
  };
}
