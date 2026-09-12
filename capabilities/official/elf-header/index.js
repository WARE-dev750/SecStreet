#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function parseHeader(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s{2}([A-Za-z][^:]*):\s+(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function pick(field) {
  return typeof field === "string" ? field.split("(")[0].trim() : "";
}

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");

      const r = spawnSync("readelf", ["-h", "--", path], { encoding: "utf8", timeout: 4000 });
      if (r.error) throw new Error("readelf failed: " + r.error.message);
      if (r.status !== 0) {
        const err = String(r.stderr || "").trim();
        throw new Error("readelf exit " + r.status + (err ? ": " + err : ""));
      }

      const h = parseHeader(r.stdout);
      if (!h["Class"]) throw new Error("not an ELF file (no Class field in readelf output)");

      const numOrZero = (s) => {
        const n = parseInt(String(s || "").trim(), 10);
        return Number.isFinite(n) ? n : 0;
      };

      process.stdout.write(JSON.stringify({
        path,
        class: pick(h["Class"]),
        data: pick(h["Data"]),
        osabi: pick(h["OS/ABI"]),
        type: pick(h["Type"]),
        machine: pick(h["Machine"]),
        entry: (h["Entry point address"] || "").trim(),
        programHeaderCount: numOrZero(h["Number of program headers"]),
        sectionHeaderCount: numOrZero(h["Number of section headers"]),
        raw: r.stdout.trim()
      }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
