function bool(value) {
  return Boolean(value);
}

function stateFrom(options = {}) {
  return {
    shadowMode: bool(options.shadowMode),
    ambientTrust: bool(options.ambientTrust),
    verbose: bool(options.verbose),
  };
}

function labelFor(key = "") {
  if (key === "shadowMode") return "Shadow mode";
  if (key === "ambientTrust") return "Ambient trust";
  if (key === "verbose") return "Verbose trace";
  return key;
}

function summaryForChanges(changes = []) {
  if (!changes.length) return "No live runtime changes applied.";
  return changes.map((change) => `${change.label} ${change.to ? "enabled" : "disabled"}`).join(" | ");
}

export function createLiveRuntimeController(targetOptions = {}) {
  const state = stateFrom(targetOptions);
  const events = [];

  const syncTarget = () => {
    targetOptions.shadowMode = state.shadowMode;
    targetOptions.ambientTrust = state.ambientTrust;
    targetOptions.verbose = state.verbose;
    targetOptions.liveRuntime = true;
    targetOptions.liveRuntimeEvents = events.slice(0, 6);
  };

  syncTarget();

  return {
    snapshot() {
      return {
        ...state,
        events: events.slice(),
      };
    },
    decorate(options = {}) {
      return {
        ...options,
        shadowMode: state.shadowMode,
        ambientTrust: state.ambientTrust,
        verbose: state.verbose,
        liveRuntime: true,
        liveRuntimeEvents: events.slice(0, 6),
      };
    },
    apply(nextState = {}, meta = {}) {
      const candidate = {
        shadowMode: nextState.shadowMode ?? state.shadowMode,
        ambientTrust: nextState.ambientTrust ?? state.ambientTrust,
        verbose: nextState.verbose ?? state.verbose,
      };
      const changes = [];
      for (const key of Object.keys(state)) {
        if (candidate[key] === state[key]) continue;
        changes.push({
          key,
          label: labelFor(key),
          from: state[key],
          to: candidate[key],
        });
        state[key] = candidate[key];
      }
      if (!changes.length) {
        syncTarget();
        return null;
      }
      const event = {
        kind: "nornr.sentry.live_runtime_change.v1",
        changedAt: new Date().toISOString(),
        source: String(meta.source || "operator").trim() || "operator",
        changes,
        summary: summaryForChanges(changes),
      };
      events.unshift(event);
      if (events.length > 12) events.length = 12;
      syncTarget();
      return event;
    },
  };
}
