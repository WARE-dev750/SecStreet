import { ALL_PERMISSIONS, type Policy } from "./types.js";

const PERM_SET = new Set<string>(ALL_PERMISSIONS);
const TIERS = ["community", "professional", "verified", "restricted"] as const;

export function validatePolicy(
  value: unknown
): { ok: true; value: Policy } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["policy must be an object"] };
  }
  const p = value as Record<string, unknown>;
  for (const tier of TIERS) {
    const t = p[tier];
    if (typeof t !== "object" || t === null) {
      errors.push(`policy.${tier} must be an object`);
      continue;
    }
    const max = (t as Record<string, unknown>).maxPermissions;
    if (!Array.isArray(max)) {
      errors.push(`policy.${tier}.maxPermissions must be an array`);
      continue;
    }
    for (const perm of max) {
      if (typeof perm !== "string" || !PERM_SET.has(perm)) {
        errors.push(`policy.${tier}.maxPermissions has unknown permission: ${String(perm)}`);
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as Policy };
}
