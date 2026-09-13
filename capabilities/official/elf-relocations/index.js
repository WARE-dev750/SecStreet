#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// readelf -rW output:
//   Relocation section '.rela.dyn' at offset 0x640 contains 3 entries:
//     Offset          Info           Type           Sym. Value    Sym. Name + Addend
//   0000000000003d98  0000000000000008 R_X86_64_RELATIVE                    1140
const SEC_RE = /^Relocation section '([^']+)'/;
const ROW_RE = /^\s*([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+(\S+)\s+(.*)$/;

function parse(text) {
  const sections = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const sm = SEC_RE.exec(line);
    if (sm) {
      current = { section: sm[1], entries: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const tail = (m[4] || "").trim();
    // Symbol is the first token in the tail that isn't purely hex, if any.
    const tokens = tail.split(/\s+/);
    const symbol = tokens.length > 0 && !/^[0-9a-fA-F]+$/.test(tokens[0]) ? tokens[0] : "";
    current.entries.push({ offset: m[1], info: m[2], type: m[3], symbol });
  }
  return sections;
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");
      const r = spawnSync("readelf", ["-r", "-W", "--", path], { encoding: "utf8", timeout: 4000, maxBuffer: 64 * 1024 * 1024 });
      if (r.error) throw new Error("readelf failed: " + r.error.message);
      if (r.status !== 0) throw new Error("readelf exit " + r.status + ": " + String(r.stderr || "").trim());
      process.stdout.write(JSON.stringify({ path, sections: parse(r.stdout) }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
