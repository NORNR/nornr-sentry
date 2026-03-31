const SUPPORTED_SHIELDS = new Set(["cursor", "claude-desktop", "generic-mcp", "windsurf"]);
const SUPPORTED_DEMOS = new Set([
  "destructive_shell",
  "write_outside_scope",
  "vendor_mutation",
  "outbound_message",
  "paid_action",
  "credential_exfiltration",
  "production_mutation",
]);
const DEFAULT_WINDOW_MINUTES = 10;
const SUPPORTED_PROTECT_PRESETS = new Set(["repo", "secrets", "production", "spend", "outbound"]);
const SUPPORTED_TRUST_MODES = new Set(["standard", "strict", "observe-first", "repo-safe", "prod-locked", "finance-guarded", "outbound-guarded"]);
const SUPPORTED_EVAL_PACKS = new Set(["all", "repo", "secrets", "finance", "production", "outbound"]);
const SUPPORTED_HANDOFF_AUDIENCES = new Set(["team", "buyer", "auditor"]);
const DISALLOWED_PREFIXES = [
  "--remote-approval",
  "--hosted-",
  "--fleet-",
  "--baseline",
  "--registry",
  "--signer",
  "--review-pack",
  "--review-resolve",
  "--review-action",
  "--review-note",
  "--decision-",
  "--human-decision",
  "--team-trust",
  "--recovery",
  "--divergence-panel",
  "--ship-gate",
  "--canary",
  "--rollout",
  "--widen-gate",
  "--outcome-backed",
  "--pin-baseline",
  "--import-mandate-pack",
  "--export-mandate-pack",
  "--rollback-baseline",
  "--baseline-promotion-pack",
  "--hosted-decision-import",
  "--hosted-signer",
  "--hosted-compliance",
];

function buildDefaults() {
  return {
    shield: "cursor",
    printConfig: false,
    printProvider: "",
    printDemoFlow: "",
    patchCursor: false,
    patchClient: false,
    patchGuide: "",
    verifyPatch: false,
    summary: false,
    proofHub: false,
    firstStop: false,
    doctor: false,
    doctorFix: false,
    resume: false,
    evalHarness: false,
    trustAdvisor: false,
    proofLint: false,
    reviewHandoff: false,
    operatorScorecard: false,
    protectPresets: false,
    clientPaths: false,
    scalePath: false,
    policyReplay: false,
    policyReplayDemo: false,
    attackMe: false,
    shadowConversion: false,
    mandateInit: false,
    learnedMandate: false,
    apply: false,
    tightenHistory: false,
    exportRecord: "",
    copyShare: "",
    recordsFilter: "all",
    recordsActionClass: "",
    recordsSort: "latest",
    recordsLimit: 12,
    recordReplay: false,
    runtimePanel: false,
    goldenPath: false,
    records: false,
    guidedSetup: false,
    protectPreset: "",
    trustMode: "",
    evalPack: "all",
    handoffAudience: "team",
    runtimeContext: "",
    serve: false,
    shadowMode: process.env.NORNR_SHADOW_MODE === "1",
    verbose: process.env.NORNR_VERBOSE_TRACE === "1",
    ambientTrust: process.env.NORNR_AMBIENT_TRUST === "1",
    recordingMode: process.env.NORNR_RECORDING_MODE === "1",
    screenshotMode: process.env.NORNR_SCREENSHOT_MODE === "1",
    demo: "destructive_shell",
    port: 4317,
    upstreamUrl: process.env.NORNR_UPSTREAM_URL || "",
    noUpstream: false,
    mandateId: process.env.NORNR_MANDATE_ID || "mandate_local_airbag",
    ownerId: process.env.NORNR_OWNER_ID || "owner_local_operator",
    mandatePath: process.env.NORNR_MANDATE_PATH || "",
    projectRoot: process.env.NORNR_PROJECT_ROOT || "",
    learnerWindowMinutes: Number(process.env.NORNR_LEARNER_WINDOW_MINUTES || DEFAULT_WINDOW_MINUTES) || DEFAULT_WINDOW_MINUTES,
    shadowWindowMinutes: Number(process.env.NORNR_SHADOW_WINDOW_MINUTES || 60) || 60,
    cursorConfigPath: process.env.NORNR_CURSOR_CONFIG_PATH || "",
    claudeConfigPath: process.env.NORNR_CLAUDE_CONFIG_PATH || "",
    recordRootDir: process.env.NORNR_RECORD_ROOT_DIR || "",
    fastPathAllow: process.env.NORNR_FAST_PATH_ALLOW !== "0",
  };
}

function isDisallowedFlag(token = "") {
  return DISALLOWED_PREFIXES.some((prefix) => token === prefix || token.startsWith(`${prefix}-`) || token.startsWith(prefix));
}

export function parsePublicArgs(argv = process.argv.slice(2)) {
  const parsed = buildDefaults();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (isDisallowedFlag(token)) {
      throw new Error(`"${token}" is not part of the public NORNR Sentry surface.`);
    }
    if ((token === "--shield" || token === "--client") && argv[index + 1]) {
      parsed.shield = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--demo" && argv[index + 1]) {
      parsed.demo = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--mandate" && argv[index + 1]) {
      parsed.mandatePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--mandate-path" && argv[index + 1]) {
      parsed.mandatePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--project-root" && argv[index + 1]) {
      parsed.projectRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--port" && argv[index + 1]) {
      parsed.port = Number(argv[index + 1]) || parsed.port;
      index += 1;
      continue;
    }
    if (token === "--upstream-url" && argv[index + 1]) {
      parsed.upstreamUrl = argv[index + 1];
      parsed.noUpstream = false;
      index += 1;
      continue;
    }
    if (token === "--no-upstream") {
      parsed.upstreamUrl = "";
      parsed.noUpstream = true;
      continue;
    }
    if (token === "--owner-id" && argv[index + 1]) {
      parsed.ownerId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--patch-cursor") {
      parsed.patchCursor = true;
      continue;
    }
    if (token === "--patch-client") {
      parsed.patchClient = true;
      continue;
    }
    if (token === "--verify-patch") {
      parsed.verifyPatch = true;
      continue;
    }
    if (token === "--patch-guide" && argv[index + 1]) {
      parsed.patchGuide = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--summary") {
      parsed.summary = true;
      continue;
    }
    if (token === "--proof-hub") {
      parsed.proofHub = true;
      continue;
    }
    if (token === "--first-stop") {
      parsed.firstStop = true;
      continue;
    }
    if (token === "--protect-presets") {
      parsed.protectPresets = true;
      continue;
    }
    if (token === "--client-paths") {
      parsed.clientPaths = true;
      continue;
    }
    if (token === "--scale-path") {
      parsed.scalePath = true;
      continue;
    }
    if (token === "--runtime-panel") {
      parsed.runtimePanel = true;
      continue;
    }
    if (token === "--guided-setup") {
      parsed.guidedSetup = true;
      continue;
    }
    if (token === "--runtime-context" && argv[index + 1]) {
      parsed.runtimeContext = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--protect" && argv[index + 1]) {
      parsed.protectPreset = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--trust-mode" && argv[index + 1]) {
      parsed.trustMode = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--doctor") {
      parsed.doctor = true;
      continue;
    }
    if (token === "--doctor-fix") {
      parsed.doctorFix = true;
      continue;
    }
    if (token === "--resume") {
      parsed.resume = true;
      continue;
    }
    if (token === "--eval-harness") {
      parsed.evalHarness = true;
      continue;
    }
    if (token === "--eval-pack" && argv[index + 1]) {
      parsed.evalPack = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--trust-advisor") {
      parsed.trustAdvisor = true;
      continue;
    }
    if (token === "--proof-lint") {
      parsed.proofLint = true;
      continue;
    }
    if (token === "--review-handoff") {
      parsed.reviewHandoff = true;
      continue;
    }
    if (token === "--operator-scorecard") {
      parsed.operatorScorecard = true;
      continue;
    }
    if (token === "--handoff-audience" && argv[index + 1]) {
      parsed.handoffAudience = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--policy-replay") {
      parsed.policyReplay = true;
      continue;
    }
    if (token === "--policy-replay-demo") {
      parsed.policyReplayDemo = true;
      continue;
    }
    if (token === "--attack-me") {
      parsed.attackMe = true;
      parsed.policyReplayDemo = true;
      continue;
    }
    if (token === "--shadow-conversion") {
      parsed.shadowConversion = true;
      continue;
    }
    if (token === "--mandate-init") {
      parsed.mandateInit = true;
      continue;
    }
    if (token === "--learned-mandate") {
      parsed.learnedMandate = true;
      continue;
    }
    if (token === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (token === "--tighten-history") {
      parsed.tightenHistory = true;
      continue;
    }
    if (token === "--export-record") {
      const next = argv[index + 1];
      if (next && !String(next).startsWith("--")) {
        parsed.exportRecord = next;
        index += 1;
      } else {
        parsed.exportRecord = "latest";
      }
      continue;
    }
    if (token === "--copy-share") {
      const next = argv[index + 1];
      if (next && !String(next).startsWith("--")) {
        parsed.copyShare = next;
        index += 1;
      } else {
        parsed.copyShare = "summary";
      }
      continue;
    }
    if (token === "--record-replay") {
      parsed.recordReplay = true;
      continue;
    }
    if (token === "--records") {
      parsed.records = true;
      continue;
    }
    if (token === "--records-filter" && argv[index + 1]) {
      parsed.recordsFilter = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--records-sort" && argv[index + 1]) {
      parsed.recordsSort = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--records-action-class" && argv[index + 1]) {
      parsed.recordsActionClass = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--records-limit" && argv[index + 1]) {
      parsed.recordsLimit = Number(argv[index + 1]) || parsed.recordsLimit;
      index += 1;
      continue;
    }
    if (token === "--golden-path") {
      parsed.goldenPath = true;
      continue;
    }
    if (token === "--print-config") {
      parsed.printConfig = true;
      continue;
    }
    if (token === "--print-provider" && argv[index + 1]) {
      parsed.printProvider = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--print-demo-flow" && argv[index + 1]) {
      parsed.printDemoFlow = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--serve") {
      parsed.serve = true;
      continue;
    }
    if (token === "--shadow-mode") {
      parsed.shadowMode = true;
      continue;
    }
    if (token === "--verbose") {
      parsed.verbose = true;
      continue;
    }
    if (token === "--ambient-trust") {
      parsed.ambientTrust = true;
      continue;
    }
    if (token === "--recording-mode") {
      parsed.recordingMode = true;
      continue;
    }
    if (token === "--screenshot-mode") {
      parsed.screenshotMode = true;
      continue;
    }
    if (token === "--learner-window-minutes" && argv[index + 1]) {
      parsed.learnerWindowMinutes = Number(argv[index + 1]) || parsed.learnerWindowMinutes;
      index += 1;
      continue;
    }
    if (token === "--shadow-window-minutes" && argv[index + 1]) {
      parsed.shadowWindowMinutes = Number(argv[index + 1]) || parsed.shadowWindowMinutes;
      index += 1;
      continue;
    }
    if (token === "--cursor-config-path" && argv[index + 1]) {
      parsed.cursorConfigPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--claude-config-path" && argv[index + 1]) {
      parsed.claudeConfigPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--record-root-dir" && argv[index + 1]) {
      parsed.recordRootDir = argv[index + 1];
      index += 1;
      continue;
    }
  }

  if (!SUPPORTED_SHIELDS.has(parsed.shield)) {
    throw new Error(`Unsupported shield "${parsed.shield}". Expected cursor, claude-desktop, generic-mcp or windsurf.`);
  }
  if (!SUPPORTED_DEMOS.has(parsed.demo)) {
    throw new Error(`Unsupported demo "${parsed.demo}".`);
  }
  if (parsed.patchGuide && !["openai-codex", "generic-mcp", "windsurf"].includes(parsed.patchGuide)) {
    throw new Error(`Unsupported patch guide target "${parsed.patchGuide}".`);
  }
  if (parsed.protectPreset && !SUPPORTED_PROTECT_PRESETS.has(parsed.protectPreset)) {
    throw new Error(`Unsupported protect preset "${parsed.protectPreset}".`);
  }
  if (parsed.trustMode && !SUPPORTED_TRUST_MODES.has(parsed.trustMode)) {
    throw new Error(`Unsupported trust mode "${parsed.trustMode}".`);
  }
  if (parsed.evalPack && !SUPPORTED_EVAL_PACKS.has(parsed.evalPack)) {
    throw new Error(`Unsupported eval pack "${parsed.evalPack}".`);
  }
  if (parsed.handoffAudience && !SUPPORTED_HANDOFF_AUDIENCES.has(parsed.handoffAudience)) {
    throw new Error(`Unsupported handoff audience "${parsed.handoffAudience}".`);
  }
  if (parsed.copyShare && !["summary", "x", "slack", "issue", "markdown"].includes(parsed.copyShare)) {
    throw new Error(`Unsupported share copy variant "${parsed.copyShare}".`);
  }
  if (parsed.copyShare && !parsed.exportRecord) {
    parsed.exportRecord = "latest";
  }
  if (parsed.printProvider && !["openai", "anthropic", "all"].includes(parsed.printProvider)) {
    throw new Error(`Unsupported provider print target "${parsed.printProvider}".`);
  }
  if (parsed.printDemoFlow && !["openai", "anthropic"].includes(parsed.printDemoFlow)) {
    throw new Error(`Unsupported demo flow target "${parsed.printDemoFlow}".`);
  }

  return parsed;
}
