import http from "node:http";

import { updateDefendedRecord } from "../artifacts/write-record.js";
import { emitDecisionTrace } from "./decision-trace.js";
import { maybeSurfaceLearnedMandateSuggestion, renderServeLearnerNotice } from "./mandate-learner.js";
import {
  buildProviderApprovedResponse,
  buildProviderBlockedResponse,
  buildProviderShadowPassResponse,
  forwardProviderRequest,
  resolutionAllowsUpstream,
} from "./provider-proxy.js";
import { persistResolvedSession } from "./resolution.js";
import { buildSentrySessionFromAction } from "./session.js";
import { maybeSurfaceShadowConversionNotice, renderShadowConversionNotice } from "./shadow-conversion.js";
import { classifyProviderRequest } from "../intent/classify.js";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function maybeEmitServeLearnerNotice(options = {}) {
  if (!options?.serve) return;
  try {
    const result = await maybeSurfaceLearnedMandateSuggestion(options);
    if (result?.surfaced) {
      console.log(renderServeLearnerNotice(result));
    }
  } catch {
    // Keep the serve hot-path resilient if the learner cannot derive a suggestion yet.
  }
}

async function maybeEmitShadowConversion(options = {}) {
  if (!options?.serve || !options?.shadowMode) return;
  try {
    const result = await maybeSurfaceShadowConversionNotice(options);
    if (result?.surfaced) {
      console.log(renderShadowConversionNotice(result));
    }
  } catch {
    // Keep the serve hot-path resilient if shadow conversion cannot derive a notice yet.
  }
}

function sendJson(res, statusCode, payload = {}) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function createPublicSentryServer(options = {}) {
  const resolveSession = options.resolveSession;
  const ambientTracker = options.ambientTracker || null;
  const serveActivityTracker = options.serveActivityTracker || null;
  if (typeof resolveSession !== "function") {
    throw new Error("createPublicSentryServer requires a resolveSession callback.");
  }

  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const requestStartedAt = Date.now();

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, engine: "nornr-sentry" });
      return;
    }

    if (req.method === "POST" && pathname === "/intent") {
      try {
        const action = await readJson(req);
        const session = await buildSentrySessionFromAction(action, options);
        const resolution = await resolveSession(session);
        ambientTracker?.note(session, {
          status: resolution.decision.finalStatus || resolution.decision.status,
          primaryReason: resolution.decision.primaryReason,
          operatorAction: resolution.operatorAction,
        });
        serveActivityTracker?.note(session, {
          status: resolution.decision.finalStatus || resolution.decision.status,
          primaryReason: resolution.decision.primaryReason,
          operatorAction: resolution.operatorAction,
        }, {
          source: pathname,
          durationMs: Date.now() - requestStartedAt,
        });
        await maybeEmitServeLearnerNotice(options);
        await maybeEmitShadowConversion(options);
        sendJson(res, 200, {
          ok: true,
          decision: resolution.decision,
          recordPath: resolution.record.filePath,
          operatorAction: resolution.operatorAction,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String(error?.message || error) });
      }
      return;
    }

    if (req.method === "POST" && (pathname === "/v1/responses" || pathname === "/v1/chat/completions" || pathname === "/v1/messages")) {
      try {
        const body = await readJson(req);
        const action = classifyProviderRequest(body);
        const session = await buildSentrySessionFromAction(action, options);

        if (session.decision.status === "blocked") {
          let resolution = null;

          if (options.shadowMode) {
            resolution = await persistResolvedSession(session, "Shadow watch", {
              ...options,
              recordPatch: {
                resolution: {
                  shadowMode: {
                    enabled: true,
                    wouldHaveBlocked: true,
                  },
                },
              },
            });
          } else {
            resolution = await resolveSession(session);
          }

          ambientTracker?.note(session, {
            status: resolution.decision.finalStatus || resolution.decision.status,
            primaryReason: resolution.decision.primaryReason,
            operatorAction: resolution.operatorAction,
          });
          serveActivityTracker?.note(session, {
            status: resolution.decision.finalStatus || resolution.decision.status,
            primaryReason: resolution.decision.primaryReason,
            operatorAction: resolution.operatorAction,
          }, {
            source: pathname,
            durationMs: Date.now() - requestStartedAt,
          });
          emitDecisionTrace(session, {
            status: resolution.decision.finalStatus || resolution.decision.status,
            primaryReason: resolution.decision.primaryReason,
            operatorAction: resolution.operatorAction,
          }, options);
          await maybeEmitServeLearnerNotice(options);
          await maybeEmitShadowConversion(options);

          if (resolutionAllowsUpstream(resolution)) {
            if (options.upstreamUrl) {
              const upstream = await forwardProviderRequest(pathname, body, req, {
                ...options,
                session: resolution,
                operatorAction: resolution.operatorAction,
              });
              res.writeHead(upstream.statusCode, { "content-type": upstream.contentType });
              res.end(upstream.bodyText);
              return;
            }

            const approved = buildProviderApprovedResponse(pathname, session, resolution);
            res.writeHead(approved.statusCode, { "content-type": "application/json" });
            res.end(JSON.stringify(approved.body));
            return;
          }

          if (options.shadowMode && options.upstreamUrl) {
            const upstream = await forwardProviderRequest(pathname, body, req, {
              ...options,
              session: resolution,
              operatorAction: resolution.operatorAction,
            });
            res.writeHead(upstream.statusCode, { "content-type": upstream.contentType });
            res.end(upstream.bodyText);
            return;
          }

          if (options.shadowMode) {
            const shadow = buildProviderShadowPassResponse(pathname, resolution);
            shadow.body.nornr.wouldHaveBlocked = true;
            res.writeHead(shadow.statusCode, { "content-type": "application/json" });
            res.end(JSON.stringify(shadow.body));
            return;
          }

          const blocked = buildProviderBlockedResponse(pathname, session, resolution);
          res.writeHead(blocked.statusCode, { "content-type": "application/json" });
          res.end(JSON.stringify(blocked.body));
          return;
        }

        const approvedOperatorAction = session.fastPathAllow?.eligible ? "Fast-path allow" : "Approved pass";
        const approvedFinalStatus = "approved";
        const approvedStatusLine = session.fastPathAllow?.eligible
          ? `${session.statusLine} | Fast-path allow cleared an in-scope read-only intent without widening the mandate.`
          : `${session.statusLine} | Approved pass relayed upstream.`;

        if (options.upstreamUrl) {
          const updatedRecord = await updateDefendedRecord(session.record.filePath, {
            decision: {
              ...session.decision,
              finalStatus: approvedFinalStatus,
            },
            resolution: {
              finalStatus: approvedFinalStatus,
              operatorAction: approvedOperatorAction,
              statusLine: approvedStatusLine,
              fastPathAllow: Boolean(session.fastPathAllow?.eligible),
            },
          });
          session.record = {
            ...session.record,
            portablePath: updatedRecord.portablePath,
            portableRecord: updatedRecord.portableRecord,
            sharePath: updatedRecord.sharePath,
            sharePack: updatedRecord.sharePack,
          };
          ambientTracker?.note(session, {
            status: approvedFinalStatus,
            primaryReason: session.decision.primaryReason,
            operatorAction: approvedOperatorAction,
          });
          serveActivityTracker?.note(session, {
            status: approvedFinalStatus,
            primaryReason: session.decision.primaryReason,
            operatorAction: approvedOperatorAction,
          }, {
            source: pathname,
            durationMs: Date.now() - requestStartedAt,
          });
          emitDecisionTrace(session, {
            status: approvedFinalStatus,
            primaryReason: session.decision.primaryReason,
            operatorAction: approvedOperatorAction,
          }, options);
          const upstream = await forwardProviderRequest(pathname, body, req, {
            ...options,
            session,
            operatorAction: approvedOperatorAction,
          });
          await maybeEmitServeLearnerNotice(options);
          await maybeEmitShadowConversion(options);
          res.writeHead(upstream.statusCode, { "content-type": upstream.contentType });
          res.end(upstream.bodyText);
          return;
        }

        const updatedRecord = await updateDefendedRecord(session.record.filePath, {
          resolution: {
            finalStatus: session.fastPathAllow?.eligible ? "approved" : "shadow_pass",
            operatorAction: session.fastPathAllow?.eligible ? "Fast-path allow" : "Shadow pass",
            statusLine: session.fastPathAllow?.eligible
              ? `${session.statusLine} | Fast-path allow cleared an in-scope read-only intent without an upstream relay.`
              : `${session.statusLine} | Shadow pass returned because no upstream relay is configured.`,
            fastPathAllow: Boolean(session.fastPathAllow?.eligible),
          },
        });
        session.record = {
          ...session.record,
          portablePath: updatedRecord.portablePath,
          portableRecord: updatedRecord.portableRecord,
          sharePath: updatedRecord.sharePath,
          sharePack: updatedRecord.sharePack,
        };
        ambientTracker?.note(session, {
          status: session.fastPathAllow?.eligible ? "approved" : "shadow_pass",
          primaryReason: session.decision.primaryReason,
          operatorAction: session.fastPathAllow?.eligible ? "Fast-path allow" : "Shadow pass",
        });
        serveActivityTracker?.note(session, {
          status: session.fastPathAllow?.eligible ? "approved" : "shadow_pass",
          primaryReason: session.decision.primaryReason,
          operatorAction: session.fastPathAllow?.eligible ? "Fast-path allow" : "Shadow pass",
        }, {
          source: pathname,
          durationMs: Date.now() - requestStartedAt,
        });
        emitDecisionTrace(session, {
          status: session.fastPathAllow?.eligible ? "approved" : "shadow_pass",
          primaryReason: session.decision.primaryReason,
          operatorAction: session.fastPathAllow?.eligible ? "Fast-path allow" : "Shadow pass",
        }, options);
        await maybeEmitServeLearnerNotice(options);
        await maybeEmitShadowConversion(options);
        if (session.fastPathAllow?.eligible) {
          const approved = buildProviderApprovedResponse(pathname, session, {
            ...session,
            operatorAction: "Fast-path allow",
            decision: {
              ...session.decision,
              finalStatus: "approved",
            },
          });
          res.writeHead(approved.statusCode, { "content-type": "application/json" });
          res.end(JSON.stringify(approved.body));
          return;
        }
        const shadow = buildProviderShadowPassResponse(pathname, session);
        res.writeHead(shadow.statusCode, { "content-type": "application/json" });
        res.end(JSON.stringify(shadow.body));
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String(error?.message || error) });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "not_found" });
  });

  return server;
}
