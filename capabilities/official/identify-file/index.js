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
      const mimeRun = spawnSync("file", ["-b", "--mime-type", "--", path], { encoding: "utf8", timeout: 6000 });
      if (mimeRun.error || mimeRun.status !== 0) throw new Error("file --mime-type failed: " + String(mimeRun.stderr || "").trim());
      const descRun = spawnSync("file", ["-b", "--", path], { encoding: "utf8", timeout: 6000 });
      if (descRun.error || descRun.status !== 0) throw new Error("file failed: " + String(descRun.stderr || "").trim());
      process.stdout.write(JSON.stringify({
        path,
        mime: mimeRun.stdout.trim(),
        description: descRun.stdout.trim()
      }));
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err));
      process.exit(1);
    }
  });
}
main();
