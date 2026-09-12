import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";

const here = dirname(fileURLToPath(import.meta.url));
const OFFICIAL = resolve(here, "../../capabilities/official");

async function runOne(name: string, input: unknown) {
  const caps = await loadRegistry(OFFICIAL);
  const cap = caps.find((c) => c.manifest.name === name);
  if (!cap) throw new Error("missing capability: " + name);
  return runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input });
}

describe("wrapped OSS capabilities", () => {
  it("list-listening-ports returns sockets array", async () => {
    const r = await runOne("list-listening-ports", {});
    expect(r.ok).toBe(true);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.sockets)).toBe(true);
  });

  it("list-processes returns at least one process with pid, user, comm", async () => {
    const r = await runOne("list-processes", {});
    expect(r.ok).toBe(true);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.processes.length).toBeGreaterThan(0);
    const p = parsed.processes[0];
    expect(typeof p.pid).toBe("number");
    expect(typeof p.user).toBe("string");
    expect(typeof p.comm).toBe("string");
  });

  it("disk-usage returns filesystem rows with numeric fields", async () => {
    const r = await runOne("disk-usage", {});
    expect(r.ok).toBe(true);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.filesystems.length).toBeGreaterThan(0);
    const f = parsed.filesystems[0];
    expect(typeof f.filesystem).toBe("string");
    expect(typeof f.mount).toBe("string");
    expect(typeof f.blocksKb).toBe("number");
    expect(typeof f.usePercent).toBe("number");
  });

  it("hash-file hashes /etc/hostname deterministically", async () => {
    const a = await runOne("hash-file", { path: "/etc/hostname" });
    const b = await runOne("hash-file", { path: "/etc/hostname" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(JSON.parse(a.stdout).sha256).toBe(JSON.parse(b.stdout).sha256);
    expect(JSON.parse(a.stdout).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash-file rejects a path starting with '-'", async () => {
    const r = await runOne("hash-file", { path: "-rf" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must not start with/);
  });

  it("identify-file detects /etc/hostname as text", async () => {
    const r = await runOne("identify-file", { path: "/etc/hostname" });
    expect(r.ok).toBe(true);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.mime).toMatch(/text\//);
    expect(parsed.description.length).toBeGreaterThan(0);
  });

  it("hash-file requires filesystem:read and subprocess at professional tier", async () => {
    const caps = await loadRegistry(OFFICIAL);
    for (const name of ["hash-file", "identify-file", "list-processes", "list-listening-ports", "disk-usage"]) {
      const cap = caps.find((c) => c.manifest.name === name)!;
      expect(cap.manifest.trust).toBe("professional");
      expect(cap.manifest.permissions).toContain("subprocess");
    }
  });
});
