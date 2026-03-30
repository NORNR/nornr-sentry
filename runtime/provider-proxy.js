function baseHeaders(headers = {}) {
  const forwarded = { ...headers };
  delete forwarded.host;
  delete forwarded.connection;
  delete forwarded["content-length"];
  delete forwarded["accept-encoding"];
  return forwarded;
}

function providerFor(pathname, upstreamUrl = "") {
  if (pathname === "/v1/messages") return "anthropic";
  if (pathname === "/v1/responses" || pathname === "/v1/chat/completions") return "openai";
  if (/anthropic/i.test(upstreamUrl)) return "anthropic";
  return "openai";
}

function applyProviderAuth(headers, provider, options = {}) {
  const nextHeaders = {
    ...headers,
    "content-type": "application/json",
  };

  if (provider === "anthropic") {
    const anthropicKey = options.anthropicApiKey || process.env.NORNR_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
    if (!nextHeaders["x-api-key"] && anthropicKey) {
      nextHeaders["x-api-key"] = anthropicKey;
    }
    if (!nextHeaders["anthropic-version"]) {
      nextHeaders["anthropic-version"] = options.anthropicVersion || process.env.NORNR_ANTHROPIC_VERSION || "2023-06-01";
    }
    delete nextHeaders.authorization;
    delete nextHeaders.Authorization;
    return nextHeaders;
  }

  const openaiKey = options.openaiApiKey || process.env.NORNR_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!nextHeaders.authorization && !nextHeaders.Authorization && openaiKey) {
    nextHeaders.authorization = `Bearer ${openaiKey}`;
  }
  return nextHeaders;
}

function sentryMessage(session, resolution) {
  return `${resolution.operatorAction || "Blocked"}: ${session.decision.primaryReason}`;
}

function buildNornrMetadata(session, extras = {}) {
  return {
    actionClass: session.intent.actionClass,
    recordPath: session.record.filePath,
    portableRecordPath: session.record.portablePath || "",
    decision: session.decision,
    projectScope: session.projectScope?.rootDir || "",
    ...extras,
  };
}

function attachNornrMetadata(bodyText, metadata) {
  try {
    const parsed = JSON.parse(bodyText);
    return JSON.stringify({
      ...parsed,
      nornr: {
        ...(parsed.nornr || {}),
        ...metadata,
      },
    });
  } catch {
    return bodyText;
  }
}

export function resolutionAllowsUpstream(resolution) {
  return resolution?.decision?.finalStatus === "approved_once";
}

export function buildProviderBlockedResponse(pathname, session, resolution) {
  const text = sentryMessage(session, resolution);
  const nornr = buildNornrMetadata(session, {
    blocked: true,
    operatorAction: resolution.operatorAction,
    decision: resolution.decision,
  });

  if (pathname === "/v1/chat/completions") {
    return {
      statusCode: 200,
      body: {
        id: `chatcmpl_nornr_${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "nornr-sentry-block",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: text,
            },
          },
        ],
        nornr,
      },
    };
  }

  if (pathname === "/v1/messages") {
    return {
      statusCode: 200,
      body: {
        id: `msg_nornr_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: "nornr-sentry-block",
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text,
          },
        ],
        nornr,
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      id: `resp_nornr_${Date.now()}`,
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text,
            },
          ],
        },
      ],
      nornr,
    },
  };
}

export function buildProviderApprovedResponse(pathname, session, resolution) {
  const text = sentryMessage(session, resolution);
  const nornr = buildNornrMetadata(session, {
    blocked: false,
    approved: true,
    operatorAction: resolution.operatorAction,
    decision: resolution.decision,
  });

  if (pathname === "/v1/chat/completions") {
    return {
      statusCode: 200,
      body: {
        id: `chatcmpl_nornr_allow_${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "nornr-sentry-approve",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: text,
            },
          },
        ],
        nornr,
      },
    };
  }

  if (pathname === "/v1/messages") {
    return {
      statusCode: 200,
      body: {
        id: `msg_nornr_allow_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: "nornr-sentry-approve",
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text,
          },
        ],
        nornr,
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      id: `resp_nornr_allow_${Date.now()}`,
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text,
            },
          ],
        },
      ],
      nornr,
    },
  };
}

export function buildProviderShadowPassResponse(pathname, session) {
  const text = `NORNR shadow pass: ${session.decision.primaryReason} Configure NORNR_UPSTREAM_URL to relay the request upstream.`;
  const nornr = buildNornrMetadata(session, {
    blocked: false,
    shadow: true,
  });

  if (pathname === "/v1/chat/completions") {
    return {
      statusCode: 200,
      body: {
        id: `chatcmpl_nornr_shadow_${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "nornr-sentry-shadow",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: text,
            },
          },
        ],
        nornr,
      },
    };
  }

  if (pathname === "/v1/messages") {
    return {
      statusCode: 200,
      body: {
        id: `msg_nornr_shadow_${Date.now()}`,
        type: "message",
        role: "assistant",
        model: "nornr-sentry-shadow",
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text,
          },
        ],
        nornr,
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      id: `resp_nornr_shadow_${Date.now()}`,
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text,
            },
          ],
        },
      ],
      nornr,
    },
  };
}

export async function forwardProviderRequest(pathname, body, req, options = {}) {
  const upstreamUrl = options.upstreamUrl;
  if (!upstreamUrl) {
    throw new Error("forwardProviderRequest requires an upstreamUrl.");
  }

  const upstream = new URL(pathname, upstreamUrl);
  const provider = providerFor(pathname, upstreamUrl);
  const response = await fetch(upstream, {
    method: req.method,
    headers: applyProviderAuth(baseHeaders(req.headers), provider, options),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") || "application/json",
    bodyText: attachNornrMetadata(
      text,
      buildNornrMetadata(options.session, {
        relayed: true,
        upstreamUrl,
        operatorAction: options.operatorAction || "Approved pass",
        activationReport: options.activationReport || null,
      }),
    ),
  };
}
