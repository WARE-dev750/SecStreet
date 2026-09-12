#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// readelf -S -W output sample (one line per section after the column header):
//   [ 1] .interp           PROGBITS        0000000000000318 000318 00001c 00   A  0   0  1
// We only need the leading fields; extra trailing columns are ignored.
const SECTION_RE = /^\s*\[\s*\d+\]\s+(\S+)\s+(\S+)\s+([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+[0-9a-fA-F]+\s*(.*?)\s*$/;

function parseSections(text) {
  const out = [];
  let inSections = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^Section Headers:/.test(line)) { inSections = true; continue; }
    if (!inSections) continue;
    if (/^\s*\[Nr\]/.test(line)) continue;
    if (/^\s*Key to Flags:/.test(line)) break;
    const m = SECTION_RE.exec(line);
    if (!m) continue;
    const tail = (m[6] || "").trim();
    // tail can be "0   0  1" (no flags), "A  0   0  1" (flag A + links), "AX  0   0  1", etc.
    // flags are non-numeric short tokens at the start of tail
    const flagParts = [];
    for (const token of tail.split(/\s+/)) {
      if (/^[A-Z]+$/.test(token)) flagParts.push(token);
      else break;
    }
    out.push({
      name: m[1],
      type: m[2],
      address: m[3],
      offset: m[4],
      size: m[5],
      flags: flagParts.join("")
    });
  }
  return out;
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");

      const r = spawnSync("readelf", ["-S", "-W", "--", path], { encoding: "utf8", timeout: 4000 });
      if (r.error) throw new Error("readelf failed: " + r.error.message);
      if (r.status !== 0) {
        const err = String(r.stderr || "").trim();
        throw new Error("readelf exit " + r.status + (err ? ": " + err : ""));
      }

      const sections = parseSections(r.stdout);
      if (sections.length === 0) throw new Error("no section headers found (not an ELF file?)");

      process.stdout.write(JSON.stringify({ path, sections }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
