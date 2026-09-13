import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";

const here = dirname(fileURLToPath(import.meta.url));
const OFFICIAL = resolve(here, "../../capabilities/official");
const ELF_FILE = "/bin/ls";

async function runOne(name: string, input: unknown) {
  const caps = await loadRegistry(OFFICIAL);
  const cap = caps.find((c) => c.manifest.name === name);
  if (!cap) throw new Error("missing capability: " + name);
  return runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input });
}

describe("elf-dynamic", () => {
  it("finds NEEDED libraries in /bin/ls", async () => {
    const r = await runOne("elf-dynamic", { path: ELF_FILE });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(Array.isArray(out.needed)).toBe(true);
    expect(out.needed.length).toBeGreaterThan(0);
    expect(out.needed.some((n: string) => n.includes("libc"))).toBe(true);
    expect(Array.isArray(out.entries)).toBe(true);
  });
  it("rejects a path starting with '-'", async () => {
    const r = await runOne("elf-dynamic", { path: "-d" });
    expect(r.ok).toBe(false);
  });
});

describe("elf-symbols", () => {
  it("returns a non-empty symbol table for /bin/ls", async () => {
    const r = await runOne("elf-symbols", { path: ELF_FILE });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.count).toBeGreaterThan(0);
    // Every entry has the fields we promised in the output schema.
    for (const sym of out.symbols) {
      expect(typeof sym.name).toBe("string");
      expect(typeof sym.type).toBe("string");
      expect(typeof sym.bind).toBe("string");
      expect(typeof sym.vis).toBe("string");
      expect(typeof sym.ndx).toBe("string");
    }
  });
  it("filters undefined symbols when defined=true", async () => {
    const r = await runOne("elf-symbols", { path: ELF_FILE, defined: true });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    for (const s of out.symbols) expect(s.ndx).not.toBe("UND");
  });
});

describe("elf-relocations", () => {
  it("returns at least one relocation section for /bin/ls", async () => {
    const r = await runOne("elf-relocations", { path: ELF_FILE });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(Array.isArray(out.sections)).toBe(true);
    expect(out.sections.length).toBeGreaterThan(0);
    const total = out.sections.reduce((n: number, s: { entries: unknown[] }) => n + s.entries.length, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("ldd-dependencies", () => {
  it("lists shared library dependencies of /bin/ls", async () => {
    const r = await runOne("ldd-dependencies", { path: ELF_FILE });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.dependencies.length).toBeGreaterThan(0);
    expect(out.dependencies.some((d: { name: string }) => d.name.includes("libc"))).toBe(true);
  });
  it("rejects a non-ELF file", async () => {
    const r = await runOne("ldd-dependencies", { path: "/etc/hostname" });
    expect(r.ok).toBe(false);
  });
});
