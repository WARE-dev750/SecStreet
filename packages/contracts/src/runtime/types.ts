import type { CapabilityLanguage } from "../capability/types.js";
export interface InterpreterSpec { command: string; args: string[]; }
export function interpreterFor(language: CapabilityLanguage): InterpreterSpec {
  switch (language) {
    case "javascript":
    case "typescript": return { command: process.execPath, args: [] };
    case "python": return { command: "python3", args: [] };
    case "shell": return { command: "/bin/sh", args: [] };
    case "rust":
    case "go": throw new Error(`${language} capabilities must ship a compiled binary; use language: "binary"`);
    case "binary": return { command: "", args: [] };
  }
}
