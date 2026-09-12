import type { Permission } from "../policy/types.js";

export type CapabilityRisk = "low" | "medium" | "high" | "critical";
export type CapabilityTrust = "community" | "professional" | "verified" | "restricted";
export type CapabilityLanguage =
  | "javascript" | "typescript" | "python" | "rust" | "go" | "shell" | "binary";

export interface CapabilityProvenance {
  sourceRepo: string;
  sourceAuthor: string;
  license: string;
  version: string;
  modifications: string[];
}

export interface CapabilityManifest {
  name: string;
  version: string;
  description: string;
  language: CapabilityLanguage;
  entrypoint: string;
  inputSchema: string;
  outputSchema: string;
  dependencies: string[];
  os: string[];
  permissions: Permission[];
  risk: CapabilityRisk;
  trust: CapabilityTrust;
  provenance: CapabilityProvenance;
  maintainer: string;
}

export interface CapabilityRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  deniedByPolicy?: { reason: string; disallowed: Permission[] };
}
