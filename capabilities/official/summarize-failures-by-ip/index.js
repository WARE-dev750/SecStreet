#!/usr/bin/env node
let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => {
  try {
    const { events } = JSON.parse(raw || "{}");
    if (!Array.isArray(events)) throw new Error("input.events must be an array");
    const counts = new Map();
    for (const e of events) {
      if (!e || typeof e.ip !== "string") continue;
      counts.set(e.ip, (counts.get(e.ip) ?? 0) + 1);
    }
    const summary = [...counts.entries()]
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count || a.ip.localeCompare(b.ip));
    process.stdout.write(JSON.stringify({ summary }));
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err));
    process.exit(1);
  }
});
