#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// ldd output rows:
//   linux-vdso.so.1 (0x00007ffe...)
//   libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f...)
//   libfoo.so => not found
const ROW_RE = /^\s*(\S+)\s+=>\s+(\S+.*?)(?:\s+\(0x[0-9a-fA-F]+\))?$/;
const PLAIN_RE = /^\s*(\S+)\s+\(0x[0-9a-fA-F]+\)\s*$/;

function parse(text) {
  const dependencies = [];
  const missing = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = ROW_RE.exec(line);
    if (m) {
      const name = m[1];
      const resolved = m[2].trim();
      if (resolved === "not found") {
        missing.push(name);
        dependencies.push({ name, resolved: "not found" });
      } else {
        dependencies.push({ name, resolved });
      }
      continue;
    }
    const p = PLAIN_RE.exec(line);
    if (p) dependencies.push({ name: p[1], resolved: p[1] });
  }
  return { dependencies, missing };
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");
      const r = spawnSync("ldd", ["--", path], { encoding: "utf8", timeout: 4000 });
      if (r.error) throw new Error("ldd failed: " + r.error.message);
      if (r.status !== 0) {
        // ldd exits non-zero for static binaries and non-ELF files; stderr is the reason
        const err = String(r.stderr || "").trim();
        throw new Error("ldd exit " + r.status + (err ? ": " + err : ""));
      }
      const parsed = parse(r.stdout);
      process.stdout.write(JSON.stringify({ path, dependencies: parsed.dependencies, missing: parsed.missing }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
