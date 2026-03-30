function quote(value = "") {
  return `"${String(value || "").trim()}"`;
}

export function buildDecisionReason(code = "", meta = {}) {
  switch (code) {
    case "action_class_blocked":
      return {
        code,
        category: "policy_lane",
        priority: 10,
        message: `Action class ${quote(meta.actionClass)} is blocked in the current mandate.`,
      };
    case "tool_blocked":
      return {
        code,
        category: "tool_gate",
        priority: 20,
        message: `Tool ${quote(meta.tool)} is blocked in the current mandate.`,
      };
    case "path_blocked_lane":
      return {
        code,
        category: "scope_gate",
        priority: 30,
        message: `Target path ${quote(meta.path)} falls inside a blocked write lane.`,
      };
    case "path_outside_scope":
      return {
        code,
        category: "scope_gate",
        priority: 40,
        message: meta.readOnly
          ? `Target path ${quote(meta.path)} falls outside the active project read scope.`
          : `Target path ${quote(meta.path)} falls outside the allowed write scope.`,
      };
    case "outbound_requires_review":
      return {
        code,
        category: "outbound_gate",
        priority: 50,
        message: "Outbound action requires approval in the current mandate.",
      };
    case "destructive_blocked":
      return {
        code,
        category: "risk_gate",
        priority: 60,
        message: "Destructive action class is blocked in the current mandate.",
      };
    case "spend_above_threshold":
      return {
        code,
        category: "spend_gate",
        priority: 70,
        message: `Spend ${meta.spendUsd} exceeds the local threshold ${meta.threshold}.`,
      };
    case "action_class_requires_review":
      return {
        code,
        category: "review_gate",
        priority: 80,
        message: `Action class ${quote(meta.actionClass)} requires explicit review in the current mandate.`,
      };
    default:
      return {
        code: code || "unknown_reason",
        category: "unknown",
        priority: 999,
        message: String(meta.message || "Decision reason not classified.").trim() || "Decision reason not classified.",
      };
  }
}

export function sortDecisionReasons(details = []) {
  return (Array.isArray(details) ? details : [])
    .filter((detail) => detail && typeof detail === "object")
    .slice()
    .sort((left, right) => {
      if ((left.priority || 999) !== (right.priority || 999)) return (left.priority || 999) - (right.priority || 999);
      return String(left.code || "").localeCompare(String(right.code || ""));
    });
}
