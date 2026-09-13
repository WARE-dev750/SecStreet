import { ALL_PERMISSIONS } from "../policy/types.js";
import type {
  CapabilityManifest, CapabilityLanguage, CapabilityRisk, CapabilityTrust, CapabilityKind,
} from "./types.js";

const LANGUAGES: CapabilityLanguage[] = [
  "javascript", "typescript", "python", "rust", "go", "shell", "binary",
];
const RISKS: CapabilityRisk[] = ["low", "medium", "high", "critical"];
const TRUSTS: CapabilityTrust[] = ["community", "professional", "verified", "restricted"];
const KINDS: CapabilityKind[] = ["capability", "adapter"];
const PERM_SET = new Set<string>(ALL_PERMISSIONS);

export function validateManifest(
  value: unknown
): { ok: true; value: CapabilityManifest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const m = value as Record<string, unknown>;

  if (typeof m.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(m.name)) {
    errors.push("name must be a kebab-case string");
  }
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+/.test(m.version)) {
    errors.push("version must be a semver-like string");
  }
  if (typeof m.description !== "string" || !m.description) {
    errors.push("description must be a non-empty string");
  }
  if (m.kind !== undefined) {
    if (typeof m.kind !== "string" || !KINDS.includes(m.kind as CapabilityKind)) {
      errors.push("kind must be one of: " + KINDS.join(", "));
    }
  }
  if (typeof m.language !== "string" || !LANGUAGES.includes(m.language as CapabilityLanguage)) {
    errors.push("language must be one of: " + LANGUAGES.join(", "));
  }
  if (typeof m.entrypoint !== "string" || !m.entrypoint) errors.push("entrypoint must be non-empty");
  if (typeof m.inputSchema !== "string" || !m.inputSchema) errors.push("inputSchema must be non-empty");
  if (typeof m.outputSchema !== "string" || !m.outputSchema) errors.push("outputSchema must be non-empty");
  if (!Array.isArray(m.dependencies) || !m.dependencies.every((x) => typeof x === "string")) {
    errors.push("dependencies must be a string[]");
  }
  if (!Array.isArray(m.os) || !m.os.every((x) => typeof x === "string")) {
    errors.push("os must be a string[]");
  }
  if (!Array.isArray(m.permissions)) {
    errors.push("permissions must be an array");
  } else {
    for (const perm of m.permissions) {
      if (typeof perm !== "string" || !PERM_SET.has(perm)) {
        errors.push("permissions has unknown value: " + String(perm));
      }
    }
  }
  if (typeof m.risk !== "string" || !RISKS.includes(m.risk as CapabilityRisk)) {
    errors.push("risk must be one of: " + RISKS.join(", "));
  }
  if (typeof m.trust !== "string" || !TRUSTS.includes(m.trust as CapabilityTrust)) {
    errors.push("trust must be one of: " + TRUSTS.join(", "));
  }
  if (typeof m.maintainer !== "string" || !m.maintainer) errors.push("maintainer must be non-empty");
  if (m.tags !== undefined) {
    if (!Array.isArray(m.tags) || !m.tags.every((x) => typeof x === "string")) {
      errors.push("tags must be a string[] when present");
    }
  }
  if (typeof m.provenance !== "object" || m.provenance === null) {
    errors.push("provenance must be an object");
  } else {
    const p = m.provenance as Record<string, unknown>;
    if (typeof p.sourceRepo !== "string") errors.push("provenance.sourceRepo must be string");
    if (typeof p.sourceAuthor !== "string") errors.push("provenance.sourceAuthor must be string");
    if (typeof p.license !== "string") errors.push("provenance.license must be string");
    if (typeof p.version !== "string") errors.push("provenance.version must be string");
    if (!Array.isArray(p.modifications)) errors.push("provenance.modifications must be array");
  }
  if (m.execution !== undefined) {
    if (typeof m.execution !== "object" || m.execution === null) {
      errors.push("execution must be an object");
    } else {
      const e = m.execution as Record<string, unknown>;
      if (e.timeoutMs !== undefined && (typeof e.timeoutMs !== "number" || e.timeoutMs <= 0)) {
        errors.push("execution.timeoutMs must be a positive number");
      }
      if (e.cwd !== undefined && typeof e.cwd !== "string") {
        errors.push("execution.cwd must be a string");
      }
      if (e.env !== undefined) {
        if (typeof e.env !== "object" || e.env === null || Array.isArray(e.env)) {
          errors.push("execution.env must be an object");
        } else {
          for (const [k, v] of Object.entries(e.env)) {
            if (typeof v !== "string") errors.push("execution.env[" + k + "] must be a string");
          }
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as CapabilityManifest };
}
