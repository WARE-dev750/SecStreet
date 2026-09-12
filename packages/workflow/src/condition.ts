import type { StepCondition } from "./types.js";

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function evaluateCondition(
  cond: StepCondition,
  outputs: Map<string, unknown>
): { ok: true; result: boolean } | { ok: false; reason: string } {
  const source = outputs.get(cond.step);
  if (source === undefined) {
    return { ok: false, reason: "condition references unknown or skipped step: " + cond.step };
  }
  const actual = getPath(source, cond.path);
  switch (cond.op) {
    case "exists":
      return { ok: true, result: actual !== undefined && actual !== null };
    case "equals":
      return { ok: true, result: actual === cond.value };
    case "notEquals":
      return { ok: true, result: actual !== cond.value };
    case "contains":
      if (typeof actual === "string" && typeof cond.value === "string") {
        return { ok: true, result: actual.includes(cond.value) };
      }
      if (Array.isArray(actual)) {
        return { ok: true, result: actual.includes(cond.value) };
      }
      return { ok: true, result: false };
    case "greaterThan":
      if (typeof actual === "number" && typeof cond.value === "number") {
        return { ok: true, result: actual > cond.value };
      }
      return { ok: true, result: false };
    case "lessThan":
      if (typeof actual === "number" && typeof cond.value === "number") {
        return { ok: true, result: actual < cond.value };
      }
      return { ok: true, result: false };
    default:
      return { ok: false, reason: "unknown condition op" };
  }
}
