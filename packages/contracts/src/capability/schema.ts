import type { CapabilityManifest } from "./types.js";

export function validateManifest(value: unknown): { ok: true; value: CapabilityManifest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["manifest must be an object"] };
  const m = value as Record<string, unknown>;
  const req = ["name","version","description","language","entrypoint","inputSchema","outputSchema","dependencies","os","permissions","risk","trust","provenance","maintainer"];
  for (const k of req) if (!(k in m)) errors.push(`missing field: ${k}`);
  if (typeof m.name === "string" && !/^[a-z0-9][a-z0-9-]*$/.test(m.name)) errors.push("name must be kebab-case");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as CapabilityManifest };
}
