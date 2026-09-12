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

describe("elf-header", () => {
  it("reads the ELF header from /bin/ls", async () => {
    const r = await runOne("elf-header", { path: ELF_FILE });
    expect(r.ok).toBe(true);
    const h = JSON.parse(r.stdout);
    expect(h.path).toBe(ELF_FILE);
    expect(["ELF32", "ELF64"]).toContain(h.class);
    expect(h.data.length).toBeGreaterThan(0);
    expect(h.machine.length).toBeGreaterThan(0);
    expect(h.entry).toMatch(/^0x[0-9a-f]+$/);
    expect(h.sectionHeaderCount).toBeGreaterThan(0);
  });

  it("rejects a path starting with '-'", async () => {
    const r = await runOne("elf-header", { path: "-h" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must not start with/);
  });

  it("rejects a non-ELF file", async () => {
    const r = await runOne("elf-header", { path: "/etc/hostname" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/not an ELF file|readelf exit/);
  });
});

describe("elf-sections", () => {
  it("lists sections from /bin/ls", async () => {
    const r = await runOne("elf-sections", { path: ELF_FILE });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(Array.isArray(out.sections)).toBe(true);
    expect(out.sections.length).toBeGreaterThan(5);
    const text = out.sections.find((s: { name: string }) => s.name === ".text");
    expect(text).toBeDefined();
    expect(text.address).toMatch(/^[0-9a-fA-F]+$/);
    expect(text.size).toMatch(/^[0-9a-fA-F]+$/);
    expect(text.flags).toMatch(/[AX]/);
  });

  it("rejects a path starting with '-'", async () => {
    const r = await runOne("elf-sections", { path: "-S" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must not start with/);
  });

  it("rejects a non-ELF file", async () => {
    const r = await runOne("elf-sections", { path: "/etc/hostname" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/no section headers|readelf exit/);
  });
});
