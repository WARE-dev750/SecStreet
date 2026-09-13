#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// readelf -sW rows:
//    Num:    Value          Size Type    Bind   Vis      Ndx Name
//     12: 0000000000001000    42 FUNC    GLOBAL DEFAULT   12 main
const SYM_RE = /^\s*\d+:\s+[0-9a-fA-F]+\s+\d+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/;

function parse(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*Num:/.test(line)) continue;
    if (/^Symbol table /.test(line)) continue;
    const m = SYM_RE.exec(line);
    if (!m) continue;
    out.push({
      type: m[1], bind: m[2], vis: m[3], ndx: m[4],
      name: (m[5] || "").trim()
    });
  }
  return out;
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw || "{}");
      const path = input.path;
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");
      const args = input.defined ? ["-s", "-W", "--", path] : ["-s", "-W", "--", path];
      const r = spawnSync("readelf", args, { encoding: "utf8", timeout: 4000, maxBuffer: 64 * 1024 * 1024 });
      if (r.error) throw new Error("readelf failed: " + r.error.message);
      if (r.status !== 0) throw new Error("readelf exit " + r.status + ": " + String(r.stderr || "").trim());
      let symbols = parse(r.stdout);
      if (input.defined) symbols = symbols.filter((s) => s.ndx !== "UND");
      process.stdout.write(JSON.stringify({ path, count: symbols.length, symbols }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
