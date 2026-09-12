import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Project, listLibrary } from "@secstreet/project";
import { hashJson } from "@secstreet/capability";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../capabilities/official");

describe("audit log", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-audit-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("hashJson is canonical and order-independent", () => {
    const a = hashJson({ b: 1, a: 2 });
    const b = hashJson({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a.startsWith("sha256-")).toBe(true);
  });

  it("appends entries and reads them back in order", async () => {
    const p = await Project.init(join(tmp, "proj"), "proj");
    await p.recordAudit({
      ts: "2026-01-01T00:00:00.000Z", kind: "run", capability: "x", version: "0.1.0",
      integrity: "sha256-abc", trust: "community", declared: [], inputHash: "sha256-0",
      outputHash: "sha256-1", exitCode: 0, durationMs: 5, outcome: "ok",
    });
    await p.recordAudit({
      ts: "2026-01-01T00:00:01.000Z", kind: "run", capability: "y", version: "0.1.0",
      integrity: "sha256-def", trust: "verified", declared: [], inputHash: "sha256-0",
      outputHash: "sha256-2", exitCode: 1, durationMs: 7, outcome: "error",
    });
    const all = await p.readAudit();
    expect(all).toHaveLength(2);
    expect(all[0].capability).toBe("x");
    expect(all[1].capability).toBe("y");
  });

  it("tail returns the last N", async () => {
    const p = await Project.init(join(tmp, "proj"), "proj");
    for (let i = 0; i < 5; i++) {
      await p.recordAudit({
        ts: "2026-01-01T00:00:0" + i + ".000Z", kind: "run", capability: "c" + i, version: "0.1.0",
        integrity: "sha256-x", trust: "community", declared: [], inputHash: "sha256-a",
        outputHash: "sha256-b", exitCode: 0, durationMs: 1, outcome: "ok",
      });
    }
    const tail = await p.tailAudit(2);
    expect(tail).toHaveLength(2);
    expect(tail[0].capability).toBe("c3");
    expect(tail[1].capability).toBe("c4");
  });

  it("installed capability can be run then appears in audit", async () => {
    const p = await Project.init(join(tmp, "proj"), "proj");
    const caps = await listLibrary({ label: "lib", path: LIB });
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await p.install(cap, LIB);

    const input = { text: "Jan 10 12:00:01 host sshd[123]: Failed password for bob from 10.0.0.2 port 22 ssh2" };
    const rec = p.manifestData.installed["parse-auth-log"];
    await p.recordAudit({
      ts: new Date().toISOString(), kind: "run", capability: "parse-auth-log", version: cap.manifest.version,
      integrity: rec?.integrity ?? "", trust: cap.manifest.trust, declared: cap.manifest.permissions as string[],
      inputHash: hashJson(input), outputHash: hashJson({ events: [] }), exitCode: 0, durationMs: 42, outcome: "ok",
    });
    const all = await p.readAudit();
    expect(all).toHaveLength(1);
    expect(all[0].inputHash).toBe(hashJson(input));
    expect(all[0].integrity).toBe(rec?.integrity);
  });
});
