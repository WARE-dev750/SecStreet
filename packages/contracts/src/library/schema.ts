import type { LibraryIndex } from "./types.js";

export function validateLibraryIndex(
  value: unknown
): { ok: true; value: LibraryIndex } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return { ok: false, errors: ["index must be an object"] };
  const x = value as Record<string, unknown>;
  if (typeof x.libraryName !== "string" || !x.libraryName) errors.push("libraryName required");
  if (typeof x.libraryVersion !== "string" || !x.libraryVersion) errors.push("libraryVersion required");
  if (typeof x.maintainer !== "string" || !x.maintainer) errors.push("maintainer required");
  if (typeof x.generatedAt !== "string") errors.push("generatedAt required");
  if (!Array.isArray(x.capabilities)) errors.push("capabilities must be array");
  else for (const c of x.capabilities as unknown[]) {
    if (typeof c !== "object" || c === null) { errors.push("capability must be object"); continue; }
    const cc = c as Record<string, unknown>;
    if (typeof cc.name !== "string") errors.push("capability.name required");
    if (typeof cc.version !== "string") errors.push("capability.version required");
    if (typeof cc.path !== "string") errors.push("capability.path required");
    if (typeof cc.integrity !== "string") errors.push("capability.integrity required");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as LibraryIndex };
}
