import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type AuditOutcome = "ok" | "error" | "denied-policy" | "denied-integrity";

export interface AuditEntry {
  ts: string;
  kind: "run" | "workflow-step";
  capability: string;
  version: string;
  integrity: string;
  trust: string;
  declared: string[];
  inputHash: string;
  outputHash: string;
  exitCode: number;
  durationMs: number;
  outcome: AuditOutcome;
  workflow?: string;
  stepId?: string;
}

export class AuditLog {
  constructor(private readonly path: string) {}

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(entry) + "\n", "utf8");
  }

  async read(): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return [];
    }
    const out: AuditEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as AuditEntry);
      } catch {
        // skip malformed line; keep the rest of the log intact
      }
    }
    return out;
  }

  async tail(n: number): Promise<AuditEntry[]> {
    const all = await this.read();
    return n >= all.length ? all : all.slice(all.length - n);
  }
}

export function auditPathFor(projectRoot: string): string {
  return join(projectRoot, ".secstreet", "audit.log");
}
