import type {
  CapabilityManifest,
  CapabilityLanguage,
  CapabilityRisk,
  CapabilityTrust,
} from "./types.js";

const LANGUAGES: CapabilityLanguage[] = [
  "javascript", "typescript", "python", "rust", "go", "shell", "binary",
];
const RISKS: CapabilityRisk[] = ["low", "medium", "high", "critical"];
const TRUSTS: CapabilityTrust[] = ["community", "professional", "verified", "restricted"];

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
  if (typeof m.language !== "string" || !LANGUAGES.includes(m.language as CapabilityLanguage)) {
    errors.push(`language must be one of: ${LANGUAGES.join(", ")}`);
  }
  if (typeof m.entrypoint !== "string" || !m.entrypoint) {
    errors.push("entrypoint must be a non-empty string");
  }
  if (typeof m.inputSchema !== "string" || !m.inputSchema) {
    errors.push("inputSchema must be a non-empty string");
  }
  if (typeof m.outputSchema !== "string" || !m.outputSchema) {
    errors.push("outputSchema must be a non-empty string");
  }
  if (!Array.isArray(m.dependencies) || !m.dependencies.every((x) => typeof x === "string")) {
    errors.push("dependencies must be a string[]");
  }
  if (!Array.isArray(m.os) || !m.os.every((x) => typeof x === "string")) {
    errors.push("os must be a string[]");
  }
  if (!Array.isArray(m.permissions) || !m.permissions.every((x) => typeof x === "string")) {
    errors.push("permissions must be a string[]");
  }
  if (typeof m.risk !== "string" || !RISKS.includes(m.risk as CapabilityRisk)) {
    errors.push(`risk must be one of: ${RISKS.join(", ")}`);
  }
  if (typeof m.trust !== "string" || !TRUSTS.includes(m.trust as CapabilityTrust)) {
    errors.push(`trust must be one of: ${TRUSTS.join(", ")}`);
  }
  if (typeof m.maintainer !== "string" || !m.maintainer) {
    errors.push("maintainer must be a non-empty string");
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

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as CapabilityManifest };
}
