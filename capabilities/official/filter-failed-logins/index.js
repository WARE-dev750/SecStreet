#!/usr/bin/env node
let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => {
  try {
    const { events } = JSON.parse(raw || "{}");
    if (!Array.isArray(events)) throw new Error("input.events must be an array");
    const filtered = events.filter((e) => e && e.result === "failure");
    process.stdout.write(JSON.stringify({ events: filtered }));
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err));
    process.exit(1);
  }
});
