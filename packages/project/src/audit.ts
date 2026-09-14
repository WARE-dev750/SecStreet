import type { Storage } from "@secstreet/contracts";

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

export const AUDIT_PATH = ".secstreet/audit.log";

// AuditLog writes to a Storage backend. The default Project uses
// LocalStorage rooted at the project directory, so entries land in
// .secstreet/audit.log on disk. Passing MemoryStorage makes the log
// live only in memory — useful for tests and preview environments.
export class AuditLog {
  constructor(private readonly storage: Storage, private readonly path: string) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.storage.append(this.path, JSON.stringify(entry) + "\n");
  }

  async read(): Promise<AuditEntry[]> {
    const raw = await this.storage.read(this.path);
    if (!raw) return [];
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

// Kept for compatibility with code that still calls auditPathFor().
export function auditPathFor(projectRoot: string): string {
  return projectRoot + "/" + AUDIT_PATH;
}
