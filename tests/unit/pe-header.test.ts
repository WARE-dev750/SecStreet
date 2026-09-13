import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";

const here = dirname(fileURLToPath(import.meta.url));
const OFFICIAL = resolve(here, "../../capabilities/official");

// We synthesize a minimal valid PE32+ file in memory. Two sections (.text, .data),
// AMD64 machine, DLL characteristic set, a couple of known section flags.
function buildMinimalPe64(): Buffer {
  const buf = Buffer.alloc(0x400);
  // DOS header
  buf.writeUInt16LE(0x5a4d, 0); // MZ
  buf.writeUInt32LE(0x80, 0x3c); // e_lfanew
  // PE signature
  buf.writeUInt32LE(0x00004550, 0x80);
  // COFF file header at 0x84
  buf.writeUInt16LE(0x8664, 0x84);  // machine = AMD64
  buf.writeUInt16LE(2, 0x86);        // number of sections
  buf.writeUInt32LE(0x65000000, 0x88); // timestamp (arbitrary)
  buf.writeUInt16LE(0x00f0, 0x94);    // optional header size = 240
  buf.writeUInt16LE(0x2022, 0x96);    // characteristics: EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE | DLL
  // Optional header at 0x98
  buf.writeUInt16LE(0x020b, 0x98);    // PE32+ magic
  buf.writeUInt32LE(0x1000, 0x98 + 16); // entry point
  buf.writeBigUInt64LE(0x140000000n, 0x98 + 24); // image base
  buf.writeUInt32LE(0x1000, 0x98 + 32); // section alignment
  buf.writeUInt32LE(0x200, 0x98 + 36);  // file alignment
  buf.writeUInt16LE(2, 0x98 + 68);      // subsystem WINDOWS_GUI
  buf.writeUInt16LE(0x0100, 0x98 + 70); // dll characteristics NX_COMPAT
  // Section table at 0x98 + 0xf0 = 0x188
  const sections = [
    { name: ".text", vsize: 0x800, vaddr: 0x1000, rsize: 0x800, roff: 0x200, chars: 0x60000020 },
    { name: ".data", vsize: 0x400, vaddr: 0x2000, rsize: 0x200, roff: 0xa00, chars: 0xc0000040 },
  ];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    const base = 0x188 + i * 40;
    const nameBytes = Buffer.alloc(8);
    nameBytes.write(s.name, 0, "ascii");
    nameBytes.copy(buf, base);
    buf.writeUInt32LE(s.vsize, base + 8);
    buf.writeUInt32LE(s.vaddr, base + 12);
    buf.writeUInt32LE(s.rsize, base + 16);
    buf.writeUInt32LE(s.roff, base + 20);
    buf.writeUInt32LE(s.chars, base + 36);
  }
  return buf;
}

let tmp: string;
let pePath: string;
let notPePath: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "secstreet-pe-"));
  pePath = join(tmp, "test.exe");
  notPePath = join(tmp, "not.exe");
  await writeFile(pePath, buildMinimalPe64());
  await writeFile(notPePath, "not a PE file, just some text padded to be larger than the minimum ELF/PE size check\n");
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function runOne(name: string, input: unknown) {
  const caps = await loadRegistry(OFFICIAL);
  const cap = caps.find((c) => c.manifest.name === name);
  if (!cap) throw new Error("missing capability: " + name);
  return runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input });
}

describe("pe-header", () => {
  it("parses a synthesized PE32+ file", async () => {
    const r = await runOne("pe-header", { path: pePath });
    expect(r.ok).toBe(true);
    const p = JSON.parse(r.stdout);
    expect(p.machine).toBe("AMD64");
    expect(p.machineCode).toBe(0x8664);
    expect(p.numberOfSections).toBe(2);
    expect(p.optionalHeaderMagic).toBe("PE32+");
    expect(p.subsystem).toBe("WINDOWS_GUI");
    expect(p.entryPoint).toBe(0x1000);
    expect(p.imageBase).toBe("5368709120");
    expect(p.sectionAlignment).toBe(0x1000);
    expect(p.fileAlignment).toBe(0x200);
  });

  it("lists the sections with correct addresses and flags", async () => {
    const r = await runOne("pe-header", { path: pePath });
    const p = JSON.parse(r.stdout);
    expect(p.sections).toHaveLength(2);
    const text = p.sections.find((s: { name: string }) => s.name === ".text");
    expect(text).toBeDefined();
    expect(text.virtualAddress).toBe(0x1000);
    expect(text.rawOffset).toBe(0x200);
    expect(text.characteristics).toContain("MEM_EXECUTE");
    expect(text.characteristics).toContain("MEM_READ");
    const data = p.sections.find((s: { name: string }) => s.name === ".data");
    expect(data.characteristics).toContain("CNT_INITIALIZED_DATA");
    expect(data.characteristics).toContain("MEM_WRITE");
  });

  it("detects the DLL characteristic", async () => {
    const r = await runOne("pe-header", { path: pePath });
    const p = JSON.parse(r.stdout);
    expect(p.characteristics).toContain("DLL");
    expect(p.isDll).toBe(true);
  });

  it("rejects a non-PE file with a clear error", async () => {
    const r = await runOne("pe-header", { path: notPePath });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/not a PE file/);
  });

  it("rejects a path starting with '-'", async () => {
    const r = await runOne("pe-header", { path: "-s" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must not start with/);
  });
});
