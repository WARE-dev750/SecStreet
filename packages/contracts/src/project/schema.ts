import type { ProjectManifest } from "./types.js";
export function validateProjectManifest(
  value: unknown
): { ok: true; value: ProjectManifest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["manifest must be object"] };
  const m = value as Record<string, unknown>;
  if (typeof m.name !== "string" || !m.name) errors.push("bad name");
  if (typeof m.version !== "string" || !m.version) errors.push("bad version");
  if (typeof m.installed !== "object" || m.installed === null || Array.isArray(m.installed)) errors.push("bad installed");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as ProjectManifest };
}
