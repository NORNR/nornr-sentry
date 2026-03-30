import { parsePublicArgs } from "./public-args.js";
import { createAmbientTrustTracker, emitDecisionTrace, formatAmbientTrustHeartbeat } from "./decision-trace.js";
import { buildClientAdapter } from "../adapters/clients.js";
import { buildPatchChooserView, buildPatchGuideView, buildPatchInspectView, buildPatchSummaryView, buildVerifyChooserView, inspectClientPatchTarget, patchClientConfig, patchTargetExplicitlyRequested, renderPatchChooser, renderPatchGuide, renderPatchInspect, renderPatchSummary, renderVerifyChooser } from "./patch-cursor.js";
import { buildPolicyReplay, buildPolicyReplayView, renderPolicyReplay } from "./policy-replay.js";
import { buildRecordingFlow } from "./recording-flow.js";
import {
  applyMandateInitPlan,
  buildMandateInitPlan,
  readMandateHistoryEntries,
  renderMandateApplySummary,
  renderMandateInitPlan,
  renderTightenHistory,
} from "./mandate-state.js";
import {
  applyLearnedMandate,
  buildLearnedMandate,
  renderAppliedLearnedMandate,
  renderLearnedMandate,
} from "./mandate-learner.js";
import { persistResolvedSession } from "./resolution.js";
import { buildSentrySession } from "./session.js";
import { createPublicSentryServer } from "./public-server.js";
import { buildSentrySummary, buildSentrySummaryView, renderSentrySummary } from "./summary.js";
import { buildSentryDefendedRecordExportView, exportSentryDefendedRecord, renderSentryDefendedRecordExport } from "./record-export.js";
import { buildRecordReplay, renderRecordReplay } from "./record-replay.js";
import { buildRecordsBrowser, buildRecordsBrowserView, renderRecordsBrowser } from "./records-browser.js";
import { buildProofHub, buildProofHubView, renderProofHub } from "./proof-hub.js";
import { buildServeStatusView, renderServeStatus } from "./serve-status.js";
import { buildRuntimeConfigView, renderRuntimeConfig } from "./runtime-config.js";
import { createLiveRuntimeController } from "./live-runtime.js";
import { renderSentryWelcome } from "./welcome.js";
import { applyGuidedSetup } from "./first-run.js";
import { createServeActivityTracker } from "./serve-activity.js";
import { buildGoldenPathWizard, buildGoldenPathWizardView, renderGoldenPathWizard } from "./golden-path.js";

function supportsInteractiveReview() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === "function");
}

function clearInteractiveSurface() {
  if (!process.stdout?.isTTY) return;
  process.stdout.write("\u001b[2J\u001b[3J\u001b[H");
}

function createNavigationState(currentArgv = [], parentNavigation = {}) {
  return {
    homeArgv: Array.isArray(parentNavigation.homeArgv) ? parentNavigation.homeArgv : [],
    backArgv: Array.isArray(currentArgv) ? currentArgv : [],
  };
}

async function showWelcomeSurface(parsed = {}, navigation = {}) {
  if (!supportsInteractiveReview()) {
    console.log(renderSentryWelcome(parsed));
    return { parsed, welcome: true, renderer: "text" };
  }

  const React = (await import("react")).default;
  const { render } = await import("ink");
  const { SentryWelcomeApp } = await import("../tui/app.js");
  let launchArgv = null;

  await new Promise((resolve) => {
    const instance = render(
      React.createElement(SentryWelcomeApp, {
        options: parsed,
        navigation,
        onLaunch: (argv) => {
          launchArgv = argv;
          instance.clear?.();
          instance.unmount();
          resolve();
        },
        onExit: () => {
          instance.unmount();
          resolve();
        },
      }),
    );
  });

  return { parsed, welcome: true, renderer: "ink", launchArgv };
}

async function showReadOnlySurface({ parsed = {}, data, buildView, renderText, navigation = {} }) {
  if (!supportsInteractiveReview()) {
    console.log(renderText(data));
    return { parsed, renderer: "text" };
  }

  const React = (await import("react")).default;
  const { render } = await import("ink");
  const { SentrySurfaceApp } = await import("../tui/app.js");
  let launchArgv = null;

  await new Promise((resolve) => {
    const instance = render(
      React.createElement(SentrySurfaceApp, {
        data,
        buildView,
        paletteOptions: parsed,
        navigation,
        onLaunch: (argv) => {
          launchArgv = argv;
          instance.clear?.();
          instance.unmount();
          resolve();
        },
        onExit: () => {
          instance.unmount();
          resolve();
        },
      }),
    );
  });

  return { parsed, renderer: "ink", launchArgv };
}

async function showServeSurface({ parsed = {}, server, buildView, renderText, navigation = {}, runtimeController = null }) {
  if (!supportsInteractiveReview()) {
    console.log(renderText(parsed));
    return { parsed, renderer: "text", server };
  }

  const React = (await import("react")).default;
  const { render } = await import("ink");
  const { SentryRuntimeConfigApp } = await import("../tui/app.js");
  let launchArgv = null;
  const decorateServeOptions = (baseOptions = {}) => {
    const nextOptions = runtimeController?.decorate({ ...baseOptions, runtimeContext: "serve" }) || { ...baseOptions, runtimeContext: "serve" };
    if (parsed.serveActivityTracker?.snapshot) {
      nextOptions.serveActivity = parsed.serveActivityTracker.snapshot();
    }
    return nextOptions;
  };
  let currentOptions = decorateServeOptions(parsed);

  await new Promise((resolve) => {
    let instance = null;
    const renderApp = () => React.createElement(SentryRuntimeConfigApp, {
      options: currentOptions,
      buildView: buildRuntimeConfigView,
      navigation,
      onApply: (nextState) => {
        runtimeController?.apply(nextState, { source: "serve_surface" });
        currentOptions = decorateServeOptions(currentOptions);
        instance.rerender(renderApp());
      },
      onLaunch: (argv) => {
        launchArgv = argv;
        server.close(() => {
          instance.clear?.();
          instance.unmount();
          resolve();
        });
      },
      onExit: () => {
        server.close(() => {
          instance.clear?.();
          instance.unmount();
          resolve();
        });
      },
    });
    instance = render(renderApp());
    const activityTimer = parsed.serveActivityTracker?.snapshot
      ? setInterval(() => {
        currentOptions = decorateServeOptions(currentOptions);
        instance.rerender(renderApp());
      }, 1500)
      : null;
    activityTimer?.unref?.();
    const finalize = () => {
      if (activityTimer) clearInterval(activityTimer);
    };
    server.on("close", finalize);
  });

  return { parsed: currentOptions, renderer: "ink", server, launchArgv };
}

async function showRuntimeSurface({ parsed = {}, buildView, renderText, navigation = {} }) {
  if (!supportsInteractiveReview()) {
    console.log(renderText(parsed));
    return { parsed, renderer: "text" };
  }

  const React = (await import("react")).default;
  const { render } = await import("ink");
  const { SentryRuntimeConfigApp } = await import("../tui/app.js");
  let launchArgv = null;

  await new Promise((resolve) => {
    const instance = render(
      React.createElement(SentryRuntimeConfigApp, {
        options: parsed,
        buildView,
        navigation,
        onLaunch: (argv) => {
          launchArgv = argv;
          instance.clear?.();
          instance.unmount();
          resolve();
        },
        onExit: () => {
          instance.unmount();
          resolve();
        },
      }),
    );
  });

  return { parsed, renderer: "ink", launchArgv };
}

async function startServeFlow(parsed = {}, navigation = {}) {
  const liveOptions = { ...parsed, runtimeContext: "serve", liveRuntime: true };
  const runtimeController = createLiveRuntimeController(liveOptions);
  const ambientTracker = createAmbientTrustTracker(liveOptions);
  const serveActivityTracker = createServeActivityTracker(liveOptions);
  liveOptions.ambientTracker = ambientTracker;
  liveOptions.serveActivityTracker = serveActivityTracker;
  liveOptions.serveActivity = serveActivityTracker.snapshot();
  liveOptions.resolveSession = (queuedSession) => waitForResolution(queuedSession);
  const server = createPublicSentryServer(liveOptions);
  await new Promise((resolve) => server.listen(liveOptions.port, "127.0.0.1", resolve));
  if (!supportsInteractiveReview()) {
    if (liveOptions.ambientTrust) console.log(formatAmbientTrustHeartbeat(ambientTracker.snapshot(), liveOptions));
    const ambientTimer = setInterval(() => {
      if (!liveOptions.ambientTrust) return;
      console.log(formatAmbientTrustHeartbeat(ambientTracker.snapshot(), liveOptions));
    }, 15000);
    ambientTimer.unref?.();
    server.on("close", () => clearInterval(ambientTimer));
  }
  const surface = await showServeSurface({
    parsed: liveOptions,
    server,
    buildView: buildServeStatusView,
    renderText: renderServeStatus,
    navigation,
    runtimeController,
  });
  if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
    clearInteractiveSurface();
    return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv || [], navigation));
  }
  return { parsed, server, renderer: surface.renderer };
}

async function waitForResolution(session) {
  if (!supportsInteractiveReview()) {
    return persistResolvedSession(
      {
        ...session,
        statusLine: `${session.statusLine} | Headless review fallback: blocked by default`,
      },
      "Block",
      session,
    );
  }

  const React = (await import("react")).default;
  const { render } = await import("ink");
  const { SentryApp, SentryResolvedApp } = await import("../tui/app.js");

  return new Promise((resolve) => {
    const instance = render(
      React.createElement(SentryApp, {
        session,
        onResolve: (operatorAction) => {
          if (session.runtime?.screenshotMode) {
            instance.clear?.();
          }
          instance.rerender(React.createElement(SentryResolvedApp, { session, operatorAction }));
          setTimeout(async () => {
            instance.unmount();
            const resolution = await persistResolvedSession(session, operatorAction, session);
            resolve(resolution);
          }, 500);
        },
        onExit: async () => {
          instance.unmount();
          const resolution = await persistResolvedSession(
            {
              ...session,
              statusLine: `${session.statusLine} | Review closed before an explicit operator action.`,
            },
            "Block",
            session,
          );
          resolve(resolution);
        },
      }),
    );
  });
}

export async function runPublicSentryCli(argv = process.argv.slice(2), navigation = {}) {
  const parsed = {
    ...parsePublicArgs(argv),
    __argv: Array.isArray(argv) ? argv.slice() : [],
  };

  if (argv.length === 0) {
    const welcome = await showWelcomeSurface(parsed, navigation);
    if (welcome.launchArgv?.length || Array.isArray(welcome.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(welcome.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return welcome;
  }

  if (parsed.patchClient || parsed.patchCursor) {
    if (!patchTargetExplicitlyRequested(parsed.__argv)) {
      const surface = await showReadOnlySurface({
        parsed,
        data: parsed,
        buildView: buildPatchChooserView,
        renderText: renderPatchChooser,
        navigation,
      });
      if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
        clearInteractiveSurface();
        return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
      }
      return { ...surface };
    }
    if (parsed.shield === "generic-mcp") {
      const surface = await showReadOnlySurface({
        parsed,
        data: { target: "generic-mcp", options: parsed },
        buildView: (data, columns) => buildPatchGuideView(data.target, data.options, columns),
        renderText: (data) => renderPatchGuide(data.target, data.options),
        navigation,
      });
      if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
        clearInteractiveSurface();
        return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
      }
      return { ...surface };
    }
    const adapter = buildClientAdapter(parsed.shield, parsed);
    const result = await patchClientConfig(adapter, parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: result,
      buildView: buildPatchSummaryView,
      renderText: renderPatchSummary,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, patchResult: result };
  }

  if (parsed.patchGuide) {
    const surface = await showReadOnlySurface({
      parsed,
      data: { target: parsed.patchGuide, options: parsed },
      buildView: (data, columns) => buildPatchGuideView(data.target, data.options, columns),
      renderText: (data) => renderPatchGuide(data.target, data.options),
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface };
  }

  if (parsed.verifyPatch) {
    if (!patchTargetExplicitlyRequested(parsed.__argv)) {
      const surface = await showReadOnlySurface({
        parsed,
        data: parsed,
        buildView: buildVerifyChooserView,
        renderText: renderVerifyChooser,
        navigation,
      });
      if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
        clearInteractiveSurface();
        return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
      }
      return { ...surface };
    }
    if (parsed.shield === "generic-mcp") {
      const surface = await showReadOnlySurface({
        parsed,
        data: { target: "generic-mcp", options: parsed },
        buildView: (data, columns) => buildPatchGuideView(data.target, data.options, columns),
        renderText: (data) => renderPatchGuide(data.target, data.options),
        navigation,
      });
      if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
        clearInteractiveSurface();
        return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
      }
      return { ...surface };
    }
    const result = inspectClientPatchTarget(parsed.shield, parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: { ...result, shield: parsed.shield },
      buildView: buildPatchInspectView,
      renderText: renderPatchInspect,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, patchInspect: result };
  }

  if (parsed.goldenPath) {
    const wizard = buildGoldenPathWizard(parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: wizard,
      buildView: buildGoldenPathWizardView,
      renderText: renderGoldenPathWizard,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, goldenPath: wizard };
  }

  if (parsed.guidedSetup) {
    const setup = await applyGuidedSetup(parsed);
    return startServeFlow({
      ...parsed,
      serve: true,
      shadowMode: true,
      upstreamUrl: "",
      noUpstream: true,
      guidedSetupSummary: setup.summaryLines,
    }, navigation);
  }

  if (parsed.mandateInit) {
    const plan = await buildMandateInitPlan(parsed.shield, parsed);
    if (parsed.apply) {
      const result = await applyMandateInitPlan(plan, parsed);
      console.log(renderMandateApplySummary(result));
      return { parsed, mandateInit: result };
    }
    console.log(renderMandateInitPlan(plan));
    return { parsed, mandateInitPlan: plan };
  }

  if (parsed.learnedMandate) {
    const learned = await buildLearnedMandate(parsed);
    if (parsed.apply) {
      const result = await applyLearnedMandate(learned, parsed);
      console.log(renderAppliedLearnedMandate(result));
      return { parsed, learnedMandate: result };
    }
    console.log(renderLearnedMandate(learned));
    return { parsed, learnedMandate: learned };
  }

  if (parsed.tightenHistory) {
    const history = await readMandateHistoryEntries(parsed);
    console.log(renderTightenHistory(history));
    return { parsed, history };
  }

  if (parsed.records) {
    const browser = await buildRecordsBrowser(parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: browser,
      buildView: buildRecordsBrowserView,
      renderText: renderRecordsBrowser,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, recordsBrowser: browser };
  }

  if (parsed.proofHub) {
    const hub = await buildProofHub(parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: hub,
      buildView: buildProofHubView,
      renderText: renderProofHub,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, proofHub: hub };
  }

  if (parsed.recordReplay) {
    const replay = await buildRecordReplay(parsed);
    console.log(renderRecordReplay(replay));
    return { parsed, replay };
  }

  if (parsed.exportRecord) {
    const result = await exportSentryDefendedRecord(parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: result,
      buildView: buildSentryDefendedRecordExportView,
      renderText: renderSentryDefendedRecordExport,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, exportResult: result };
  }

  if (parsed.summary) {
    const summary = await buildSentrySummary(parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: summary,
      buildView: buildSentrySummaryView,
      renderText: renderSentrySummary,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, summary };
  }

  if (parsed.policyReplay || parsed.policyReplayDemo || parsed.attackMe) {
    const replay = buildPolicyReplay(parsed);
    const surface = await showReadOnlySurface({
      parsed,
      data: replay,
      buildView: buildPolicyReplayView,
      renderText: renderPolicyReplay,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface, replay };
  }

  if (parsed.printConfig) {
    const adapter = buildClientAdapter(parsed.shield, parsed);
    console.log(adapter.configSnippet);
    return { parsed, adapter };
  }

  if (parsed.printProvider) {
    const adapter = buildClientAdapter(parsed.shield, parsed);
    if (parsed.printProvider === "all") {
      console.log(["# OpenAI", adapter.providerSnippets.openai, "", "# Anthropic", adapter.providerSnippets.anthropic].join("\n"));
    } else {
      console.log(adapter.providerSnippets[parsed.printProvider]);
    }
    return { parsed, adapter };
  }

  if (parsed.printDemoFlow) {
    console.log(buildRecordingFlow(parsed.printDemoFlow, parsed));
    return { parsed };
  }

  if (parsed.shadowConversion) {
    const { buildShadowConversion, renderShadowConversion } = await import("./shadow-conversion.js");
    const conversion = await buildShadowConversion(parsed);
    console.log(renderShadowConversion(conversion));
    return { parsed, shadowConversion: conversion };
  }

  if (parsed.runtimePanel) {
    const surface = await showRuntimeSurface({
      parsed,
      buildView: buildRuntimeConfigView,
      renderText: renderRuntimeConfig,
      navigation,
    });
    if (surface.launchArgv?.length || Array.isArray(surface.launchArgv)) {
      clearInteractiveSurface();
      return runPublicSentryCli(surface.launchArgv, createNavigationState(parsed.__argv, navigation));
    }
    return { ...surface };
  }

  if (parsed.serve) {
    return startServeFlow(parsed, navigation);
  }

  const session = await buildSentrySession(parsed);
  const resolution = await waitForResolution(session);
  emitDecisionTrace(session, {
    status: resolution.decision.finalStatus || resolution.decision.status,
    primaryReason: resolution.decision.primaryReason,
    operatorAction: resolution.operatorAction,
  }, parsed);
  return { parsed, session, resolution };
}
