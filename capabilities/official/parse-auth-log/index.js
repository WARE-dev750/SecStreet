#!/usr/bin/env node
let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => {
  try {
    const { text } = JSON.parse(raw || "{}");
    if (typeof text !== "string") throw new Error("input.text must be a string");
    const events = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^(\S+ \S+ \S+)\s+\S+\s+sshd\[\d+\]:\s+(Accepted|Failed) password for (\S+) from (\S+)/);
      if (!m) continue;
      events.push({
        timestamp: m[1],
        user: m[3],
        ip: m[4],
        result: m[2] === "Accepted" ? "success" : "failure"
      });
    }
    process.stdout.write(JSON.stringify({ events }));
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err));
    process.exit(1);
  }
});
