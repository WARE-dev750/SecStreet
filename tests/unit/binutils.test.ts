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

describe("objdump-disasm", () => {
  it("disassembles /bin/ls and finds .text", async () => {
    const r = await runOne("objdump-disasm", { path: ELF_FILE });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.sections.length).toBeGreaterThan(0);
    const text = out.sections.find((s: { name: string }) => s.name === ".text");
    expect(text).toBeDefined();
    expect(text.instructionCount).toBeGreaterThan(100);
    expect(text.mnemonics).toContain("call");
  });

  it("disassembles only the requested section", async () => {
    const r = await runOne("objdump-disasm", { path: ELF_FILE, section: ".text" });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].name).toBe(".text");
  });

  it("rejects a path starting with '-'", async () => {
    const r = await runOne("objdump-disasm", { path: "-d" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must not start with/);
  });
});

describe("strings-extract", () => {
  it("extracts strings from /bin/ls", async () => {
    const r = await runOne("strings-extract", { path: ELF_FILE, minLength: 5, limit: 100 });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.count).toBeGreaterThan(0);
    expect(out.strings.length).toBe(out.count);
    expect(out.count).toBeLessThanOrEqual(100);
    for (const s of out.strings) expect(s.length).toBeGreaterThanOrEqual(5);
  });

  it("filters strings by substring", async () => {
    const r = await runOne("strings-extract", { path: ELF_FILE, contains: "GLIBC" });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    for (const s of out.strings) expect(s).toContain("GLIBC");
  });

  it("sets truncated when limit is hit", async () => {
    const r = await runOne("strings-extract", { path: ELF_FILE, limit: 5 });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.count).toBe(5);
    expect(out.truncated).toBe(true);
  });
});

describe("xxd-hexdump", () => {
  it("dumps the first bytes of /bin/ls and they start with the ELF magic", async () => {
    const r = await runOne("xxd-hexdump", { path: ELF_FILE, offset: 0, length: 16 });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.lines.length).toBeGreaterThan(0);
    const firstHex = out.lines[0].hex.replace(/\s+/g, "");
    expect(firstHex.startsWith("7f454c46")).toBe(true); // \x7fELF
    expect(out.lines[0].ascii).toContain("ELF");
  });

  it("respects offset and length", async () => {
    const r = await runOne("xxd-hexdump", { path: ELF_FILE, offset: 4, length: 4 });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    const joined = out.lines.map((l: { hex: string }) => l.hex).join(" ").replace(/\s+/g, "");
    expect(joined.length).toBe(8); // 4 bytes = 8 hex chars
  });

  it("rejects a path starting with '-'", async () => {
    const r = await runOne("xxd-hexdump", { path: "-s" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must not start with/);
  });
});
