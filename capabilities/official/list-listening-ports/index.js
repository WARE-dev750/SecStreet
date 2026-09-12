#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      JSON.parse(raw || "{}");
      const r = spawnSync("ss", ["-tulnH"], { encoding: "utf8", timeout: 4000 });
      if (r.error) throw new Error("ss failed: " + r.error.message);
      if (r.status !== 0) throw new Error("ss exit " + r.status + ": " + String(r.stderr || "").trim());
      const sockets = [];
      for (const line of r.stdout.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        sockets.push({ proto: parts[0], state: parts[1], local: parts[4], peer: parts[5] || "" });
      }
      process.stdout.write(JSON.stringify({ sockets }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
