import { buildSentrySummary } from "./summary.js";
import { pickByDensity, renderHero, renderSurface, terminalDensityFlags } from "./terminal-theme.js";

import { defaultProtectPresetForShield, demoForProtectPreset, protectPresetLabel } from "../mandates/defaults.js";

function recommendNext(summary = {}, shield = "cursor") {
  const preset = defaultProtectPresetForShield(shield);
  if (!summary.defendedRecordsCreated) {
    return {
      label: "Perfect first stop",
      argv: ["--client", shield, "--first-stop", "--protect", preset],
      why: `No defended records exist yet, so the fastest path is to prove one ${protectPresetLabel(preset).toLowerCase()} stop and open the first proof object.`,
      mode: "bootstrap",
      urgency: "high",
      followup: "After the first stop, come back here and open the defended record browser.",
    };
  }
  if ((summary.statusCounts?.blocked || 0) > 0) {
    return {
      label: "Browse defended records",
      argv: ["--client", shield, "--records", "--records-filter", "blocked"],
      why: "There are blocked records to inspect right now, so the real proof objects are the best next surface.",
      mode: "review",
      urgency: "high",
      followup: "Open the blocked proof objects first, then replay local records if you want drift comparison.",
    };
  }
  if ((summary.policyInterventionsThisWeek || 0) > 0) {
    return {
      label: "Replay local records",
      argv: ["--client", shield, "--record-replay"],
      why: "Recent operator interventions exist, so replaying real local records is the best next comparison.",
      mode: "compare",
      urgency: "medium",
      followup: "Use this when you want to know whether the current mandate still agrees with recent real stops.",
    };
  }
  return {
    label: "Replay attacks",
    argv: ["--client", shield, "--policy-replay"],
    why: "The local posture looks quiet, so synthetic replay is the best next proof pass.",
    mode: "stress",
    urgency: "low",
    followup: "Synthetic replay is best when the local record set is quiet and you want a fresh proof pass.",
  };
}

function guidedHeroLine(recommendation = {}) {
  if (!recommendation?.label) return "Choose between real local proof objects and synthetic replay surfaces.";
  return `Recommended now: ${recommendation.label}`;
}

function sortHubEntries(entries = [], recommendation = {}) {
  const target = String(recommendation?.label || "").trim().toLowerCase();
  return (Array.isArray(entries) ? entries : []).slice().sort((left, right) => {
    const leftRecommended = String(left?.label || "").trim().toLowerCase() === target ? 0 : 1;
    const rightRecommended = String(right?.label || "").trim().toLowerCase() === target ? 0 : 1;
    if (leftRecommended !== rightRecommended) return leftRecommended - rightRecommended;
    return String(left?.label || "").localeCompare(String(right?.label || ""));
  });
}

export async function buildProofHub(options = {}) {
  const shield = String(options.shield || "cursor").trim() || "cursor";
  const summary = await buildSentrySummary(options).catch(() => ({ defendedRecordsCreated: 0, statusCounts: {}, policyInterventionsThisWeek: 0 }));
  const recommendation = recommendNext(summary, shield);
  const preset = defaultProtectPresetForShield(shield);
  const entries = sortHubEntries([
      {
        label: "Perfect first stop",
        argv: ["--client", shield, "--first-stop", "--protect", preset],
        commandLines: [`nornr-sentry --client ${shield} --first-stop --protect ${preset}`],
        detailLines: [`Shortest path to the first ${protectPresetLabel(preset).toLowerCase()} stop and first defended record.`],
      },
      {
        label: "Protect presets",
        argv: ["--client", shield, "--protect-presets", "--protect", preset],
        commandLines: [`nornr-sentry --client ${shield} --protect-presets --protect ${preset}`],
        detailLines: ["Choose repo, secrets, production, spend, or outbound before you widen the install story."],
      },
      {
        label: "Browse defended records",
        argv: ["--client", shield, "--records"],
        commandLines: [`nornr-sentry --client ${shield} --records`],
        detailLines: ["Open the real local proof objects from the boundary."],
      },
      ...(summary.defendedRecordsCreated ? [{
        label: "Export latest defended record",
        argv: ["--client", shield, "--export-record", "latest"],
        commandLines: [`nornr-sentry --client ${shield} --export-record latest`],
        detailLines: ["Open the portable proof object and copy a public-safe summary, X post, or issue update."],
      }] : []),
      {
        label: "Replay local records",
        argv: ["--client", shield, "--record-replay"],
        commandLines: [`nornr-sentry --client ${shield} --record-replay`],
        detailLines: ["Re-evaluate real defended records under the current local mandate."],
      },
      {
        label: "Replay attacks",
        argv: ["--client", shield, "--policy-replay"],
        commandLines: [`nornr-sentry --client ${shield} --policy-replay`],
        detailLines: ["Run synthetic attack scenarios for staged proof."],
      },
      {
        label: "Client paths",
        argv: ["--client", shield, "--client-paths"],
        commandLines: [`nornr-sentry --client ${shield} --client-paths`],
        detailLines: ["See the real install path for Cursor, Claude Desktop, Windsurf, OpenAI / Codex, and Generic MCP."],
      },
      {
        label: "View local summary",
        argv: ["--client", shield, "--summary"],
        commandLines: [`nornr-sentry --client ${shield} --summary`],
        detailLines: ["See the local posture and latest defended record signals."],
      },
    ], recommendation);
  return {
    kind: "nornr.sentry.proof_hub.v1",
    shield,
    summary,
    recommendation,
    entries,
  };
}

export function buildProofHubView(hub = {}, explicitColumns = 80) {
  const { density, compact, columns } = terminalDensityFlags(explicitColumns);
  return {
    kind: "nornr.sentry.proof_hub_surface.v1",
    columns,
    density,
    twoColumn: !compact,
    interactiveEntries: true,
    initialSelectionSectionLabel: hub.recommendation ? "Guided recommendation" : "Proof paths",
    hero: {
      status: "PROOF HUB",
      lines: [
        `Client ${hub.shield || "cursor"} · Real proof vs synthetic replay`,
        pickByDensity({
          compact: guidedHeroLine(hub.recommendation),
          standard: hub.recommendation?.why || "Choose between real local proof objects and synthetic replay surfaces.",
          wide: `${hub.recommendation?.why || "Choose between real local proof objects and synthetic replay surfaces."} ${hub.recommendation?.followup || ""}`.trim(),
        }, density),
      ],
    },
    sections: [
      {
        label: "Proof paths",
        entries: hub.entries || [],
      },
      ...(hub.recommendation ? [{
        label: "Guided recommendation",
        entries: [{
          label: hub.recommendation.urgency === "high" ? `Recommended now · ${hub.recommendation.label}` : hub.recommendation.label,
          argv: hub.recommendation.argv,
          commandLines: [`nornr-sentry ${hub.recommendation.argv.join(" ")}`],
          detailLines: [
            hub.recommendation.why,
            hub.recommendation.followup,
          ].filter(Boolean),
        }],
      }] : []),
      {
        label: "How to use this",
        lines: [
          "Defended records are real local proof objects.",
          "Replay local records re-evaluates those proof objects under the current mandate.",
          "Export latest defended record turns the lane into a portable, shareable artifact.",
          "Replay attacks is synthetic and staged by design.",
        ],
      },
    ],
    footer: compact ? [] : ["Use this hub when you want the shortest path to the right proof surface."],
  };
}

export function renderProofHub(hub = {}) {
  const view = buildProofHubView(hub);
  return renderSurface({
    hero: renderHero(view.hero),
    sections: (view.sections || []).map((section) => ({
      label: section.label,
      lines: section.lines || (section.entries || []).flatMap((entry, index) => ([
        ...(index ? [""] : []),
        entry.label || "",
        ...((entry.commandLines || []).map((line) => `  ${line}`)),
        ...((entry.detailLines || []).map((line) => `  ${line}`)),
      ].filter(Boolean))),
    })),
    footer: view.footer,
  });
}
