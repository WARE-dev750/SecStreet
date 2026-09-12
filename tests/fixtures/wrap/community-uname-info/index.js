#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      const r = spawnSync("uname", ["-a"], { encoding: "utf8", timeout: 4000 });
      if (r.error || r.status !== 0) {
        throw new Error("uname unavailable: " + (r.error ? r.error.message : "exit " + r.status));
      }
      const rawOut = r.stdout.trim();
      const parts = rawOut.split(/\s+/);
      process.stdout.write(JSON.stringify({
        sysname: parts[0] || "",
        release: parts[2] || "",
        machine: parts[parts.length - 1] || "",
        raw: rawOut
      }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}

main();
