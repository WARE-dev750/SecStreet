import { createHash } from "node:crypto";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonical((value as Record<string, unknown>)[k]));
  return "{" + pairs.join(",") + "}";
}

export function hashJson(value: unknown): string {
  return "sha256-" + createHash("sha256").update(canonical(value)).digest("hex");
}
