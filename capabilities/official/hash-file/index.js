#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const { path } = JSON.parse(raw || "{}");
      if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");
      if (path.startsWith("-")) throw new Error("input.path must not start with '-'");
      const r = spawnSync("sha256sum", ["--", path], { encoding: "utf8", timeout: 8000 });
      if (r.error) throw new Error("sha256sum failed: " + r.error.message);
      if (r.status !== 0) throw new Error("sha256sum exit " + r.status + ": " + String(r.stderr || "").trim());
      const m = r.stdout.match(/^([0-9a-f]{64})\s/);
      if (!m) throw new Error("unexpected sha256sum output");
      process.stdout.write(JSON.stringify({ path, sha256: m[1] }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
