#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw || "{}");
      const path = input.path;
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");

      const minLength = Number.isFinite(input.minLength) ? Math.max(1, Math.min(255, input.minLength)) : 4;
      const contains = typeof input.contains === "string" && input.contains.length > 0 ? input.contains : null;
      const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(100000, input.limit)) : 10000;

      const r = spawnSync("strings", ["-n", String(minLength), "--", path], {
        encoding: "utf8", timeout: 8000, maxBuffer: 64 * 1024 * 1024
      });
      if (r.error) throw new Error("strings failed: " + r.error.message);
      if (r.status !== 0) {
        const err = String(r.stderr || "").trim();
        throw new Error("strings exit " + r.status + (err ? ": " + err : ""));
      }

      let all = r.stdout.split(/\r?\n/).filter((s) => s.length > 0);
      if (contains !== null) all = all.filter((s) => s.includes(contains));
      const truncated = all.length > limit;
      const strings = truncated ? all.slice(0, limit) : all;

      process.stdout.write(JSON.stringify({ path, count: strings.length, strings, truncated }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
