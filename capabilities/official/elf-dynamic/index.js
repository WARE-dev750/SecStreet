#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// readelf -d output rows look like:
//   0x0000000000000001 (NEEDED)             Shared library: [libc.so.6]
//   0x000000000000000f (RPATH)              Library rpath: [/opt/lib]
const TAG_RE = /^\s*0x[0-9a-fA-F]+\s+\(([^)]+)\)\s+(.*)$/;

function parse(text) {
  const entries = [];
  const needed = [];
  const rpath = [];
  const runpath = [];
  for (const line of text.split(/\r?\n/)) {
    const m = TAG_RE.exec(line);
    if (!m) continue;
    const tag = m[1];
    const rest = m[2].trim();
    let value = rest;
    const bracket = rest.match(/\[(.*)\]\s*$/);
    if (bracket) value = bracket[1];
    entries.push({ tag, value });
    if (tag === "NEEDED") needed.push(value);
    else if (tag === "RPATH") rpath.push(value);
    else if (tag === "RUNPATH") runpath.push(value);
  }
  return { entries, needed, rpath, runpath };
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");
      const r = spawnSync("readelf", ["-d", "--", path], { encoding: "utf8", timeout: 4000 });
      if (r.error) throw new Error("readelf failed: " + r.error.message);
      if (r.status !== 0) throw new Error("readelf exit " + r.status + ": " + String(r.stderr || "").trim());
      const parsed = parse(r.stdout);
      process.stdout.write(JSON.stringify({ path, needed: parsed.needed, rpath: parsed.rpath, runpath: parsed.runpath, entries: parsed.entries }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
