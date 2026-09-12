#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      JSON.parse(raw || "{}");
      const r = spawnSync("ps", ["-eo", "pid=,user=,comm=,args="], { encoding: "utf8", timeout: 4000 });
      if (r.error) throw new Error("ps failed: " + r.error.message);
      if (r.status !== 0) throw new Error("ps exit " + r.status + ": " + String(r.stderr || "").trim());
      const processes = [];
      for (const line of r.stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/);
        if (!m) continue;
        processes.push({ pid: Number(m[1]), user: m[2], comm: m[3], args: m[4] || "" });
      }
      process.stdout.write(JSON.stringify({ processes }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
