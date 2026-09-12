#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// xxd plain output: "00000000: 7f45 4c46 0201 0100 0000 0000 0000 0000  .ELF............"
const LINE_RE = /^([0-9a-fA-F]+):\s+((?:[0-9a-fA-F]{2,4}\s*)+)\s+(.*)$/;

function parseXxd(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    out.push({
      offset: m[1],
      hex: m[2].replace(/\s+/g, " ").trim(),
      ascii: m[3]
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

      const offset = Number.isFinite(input.offset) ? Math.max(0, input.offset) : 0;
      const length = Number.isFinite(input.length) ? Math.max(1, Math.min(65536, input.length)) : 512;

      const r = spawnSync("xxd", ["-s", String(offset), "-l", String(length), "--", path], {
        encoding: "utf8", timeout: 4000
      });
      if (r.error) throw new Error("xxd failed: " + r.error.message);
      if (r.status !== 0) {
        const err = String(r.stderr || "").trim();
        throw new Error("xxd exit " + r.status + (err ? ": " + err : ""));
      }

      const lines = parseXxd(r.stdout);
      process.stdout.write(JSON.stringify({ path, offset, length, lines }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
