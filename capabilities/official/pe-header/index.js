#!/usr/bin/env node
import { readFileSync } from "node:fs";

const MACHINES = {
  0x014c: "I386",
  0x0200: "IA64",
  0x8664: "AMD64",
  0x01c0: "ARM",
  0x01c4: "ARMNT",
  0xaa64: "ARM64",
  0x5032: "RISCV32",
  0x5064: "RISCV64",
};

const FILE_CHARS = [
  [0x0001, "RELOCS_STRIPPED"],
  [0x0002, "EXECUTABLE_IMAGE"],
  [0x0004, "LINE_NUMS_STRIPPED"],
  [0x0008, "LOCAL_SYMS_STRIPPED"],
  [0x0010, "AGGRESSIVE_WS_TRIM"],
  [0x0020, "LARGE_ADDRESS_AWARE"],
  [0x0080, "BYTES_REVERSED_LO"],
  [0x0100, "32BIT_MACHINE"],
  [0x0200, "DEBUG_STRIPPED"],
  [0x0400, "REMOVABLE_RUN_FROM_SWAP"],
  [0x0800, "NET_RUN_FROM_SWAP"],
  [0x1000, "SYSTEM"],
  [0x2000, "DLL"],
  [0x4000, "UP_SYSTEM_ONLY"],
  [0x8000, "BYTES_REVERSED_HI"],
];

const DLL_CHARS = [
  [0x0020, "HIGH_ENTROPY_VA"],
  [0x0040, "DYNAMIC_BASE"],
  [0x0080, "FORCE_INTEGRITY"],
  [0x0100, "NX_COMPAT"],
  [0x0200, "NO_ISOLATION"],
  [0x0400, "NO_SEH"],
  [0x0800, "NO_BIND"],
  [0x1000, "APPCONTAINER"],
  [0x2000, "WDM_DRIVER"],
  [0x4000, "GUARD_CF"],
  [0x8000, "TERMINAL_SERVER_AWARE"],
];

const SUBSYSTEMS = {
  0: "UNKNOWN", 1: "NATIVE", 2: "WINDOWS_GUI", 3: "WINDOWS_CUI",
  5: "OS2_CUI", 7: "POSIX_CUI", 9: "WINDOWS_CE_GUI",
  10: "EFI_APPLICATION", 11: "EFI_BOOT_SERVICE_DRIVER",
  12: "EFI_RUNTIME_DRIVER", 13: "EFI_ROM", 14: "XBOX", 16: "WINDOWS_BOOT_APPLICATION",
};

const SECTION_CHARS = [
  [0x00000008, "TYPE_NO_PAD"],
  [0x00000020, "CNT_CODE"],
  [0x00000040, "CNT_INITIALIZED_DATA"],
  [0x00000080, "CNT_UNINITIALIZED_DATA"],
  [0x00000100, "LNK_OTHER"],
  [0x00000200, "LNK_INFO"],
  [0x00000800, "LNK_REMOVE"],
  [0x00001000, "LNK_COMDAT"],
  [0x00008000, "GPREL"],
  [0x00020000, "MEM_PURGEABLE"],
  [0x00040000, "MEM_LOCKED"],
  [0x00080000, "MEM_PRELOAD"],
  [0x01000000, "LNK_NRELOC_OVFL"],
  [0x02000000, "MEM_DISCARDABLE"],
  [0x04000000, "MEM_NOT_CACHED"],
  [0x08000000, "MEM_NOT_PAGED"],
  [0x10000000, "MEM_SHARED"],
  [0x20000000, "MEM_EXECUTE"],
  [0x40000000, "MEM_READ"],
  [0x80000000, "MEM_WRITE"],
];

function decodeFlags(value, table) {
  const out = [];
  for (const [bit, name] of table) {
    if (value & bit) out.push(name);
  }
  return out;
}

function parsePe(buf, path) {
  if (buf.length < 0x40) throw new Error("file too small to be PE");
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error("not a PE file (missing MZ signature)");

  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 4 > buf.length) throw new Error("invalid e_lfanew (PE header offset)");
  if (buf.readUInt32LE(peOffset) !== 0x00004550) throw new Error("not a PE file (missing PE\\0\\0 signature)");

  // COFF File Header starts 4 bytes after PE signature
  const coff = peOffset + 4;
  const machineCode = buf.readUInt16LE(coff);
  const numberOfSections = buf.readUInt16LE(coff + 2);
  const timestamp = buf.readUInt32LE(coff + 4);
  const optionalHeaderSize = buf.readUInt16LE(coff + 16);
  const characteristicsValue = buf.readUInt16LE(coff + 18);

  // Optional Header starts right after COFF header (28 bytes)
  const opt = coff + 20;
  const magic = optionalHeaderSize >= 2 ? buf.readUInt16LE(opt) : 0;
  const is64 = magic === 0x020b;
  const is32 = magic === 0x010b;
  if (!is32 && !is64) throw new Error("unknown optional header magic: 0x" + magic.toString(16));

  const entryPoint = buf.readUInt32LE(opt + 16);
  const imageBase = is64
    ? buf.readBigUInt64LE(opt + 24).toString()
    : String(buf.readUInt32LE(opt + 28));
  const sectionAlignment = buf.readUInt32LE(opt + 32);
  const fileAlignment = buf.readUInt32LE(opt + 36);
  const subsystemOffset = is64 ? opt + 68 : opt + 68; // same offset in both
  const subsystemCode = buf.readUInt16LE(subsystemOffset);
  const dllCharsValue = buf.readUInt16LE(subsystemOffset + 2);

  // Section table begins immediately after optional header
  const sectionTable = coff + 20 + optionalHeaderSize;
  const sections = [];
  for (let i = 0; i < numberOfSections; i++) {
    const base = sectionTable + i * 40;
    if (base + 40 > buf.length) throw new Error("section table truncated");
    const nameBytes = buf.subarray(base, base + 8);
    const nameEnd = nameBytes.indexOf(0);
    const name = nameBytes.subarray(0, nameEnd === -1 ? 8 : nameEnd).toString("ascii");
    const virtualSize = buf.readUInt32LE(base + 8);
    const virtualAddress = buf.readUInt32LE(base + 12);
    const rawSize = buf.readUInt32LE(base + 16);
    const rawOffset = buf.readUInt32LE(base + 20);
    const charValue = buf.readUInt32LE(base + 36);
    sections.push({
      name,
      virtualAddress,
      virtualSize,
      rawSize,
      rawOffset,
      characteristics: decodeFlags(charValue, SECTION_CHARS),
    });
  }

  const fileChars = decodeFlags(characteristicsValue, FILE_CHARS);
  const isDll = fileChars.includes("DLL");

  return {
    path,
    machine: MACHINES[machineCode] || ("UNKNOWN_0x" + machineCode.toString(16)),
    machineCode,
    numberOfSections,
    timestamp,
    timestampIso: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : "",
    characteristics: fileChars,
    optionalHeaderMagic: is64 ? "PE32+" : "PE32",
    subsystem: SUBSYSTEMS[subsystemCode] || ("UNKNOWN_" + subsystemCode),
    dllCharacteristics: decodeFlags(dllCharsValue, DLL_CHARS),
    entryPoint,
    imageBase,
    sectionAlignment,
    fileAlignment,
    sections,
    isDll,
    isExe: !isDll && fileChars.includes("EXECUTABLE_IMAGE"),
  };
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");

      const buf = readFileSync(path);
      const result = parsePe(buf, path);
      process.stdout.write(JSON.stringify(result));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
