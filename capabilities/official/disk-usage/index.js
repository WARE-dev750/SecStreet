#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function main() {
  let raw = "";
  process.stdin.on("data", (d) => (raw += d.toString()));
  process.stdin.on("end", () => {
    try {
      JSON.parse(raw || "{}");
      const r = spawnSync("df", ["-kP"], { encoding: "utf8", timeout: 4000 });
      if (r.error) throw new Error("df failed: " + r.error.message);
      if (r.status !== 0) throw new Error("df exit " + r.status + ": " + String(r.stderr || "").trim());
      const filesystems = [];
      const lines = r.stdout.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;
        const usePercent = Number(String(parts[4]).replace("%", ""));
        filesystems.push({
          filesystem: parts[0],
          blocksKb: Number(parts[1]),
          usedKb: Number(parts[2]),
          availKb: Number(parts[3]),
          usePercent: Number.isFinite(usePercent) ? usePercent : 0,
          mount: parts.slice(5).join(" ")
        });
      }
      process.stdout.write(JSON.stringify({ filesystems }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
