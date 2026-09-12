let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => {
  const { events } = JSON.parse(raw || "{}");
  if (!Array.isArray(events)) { process.stderr.write("input.events must be an array"); process.exit(1); }
  process.stdout.write(JSON.stringify({ count: events.length }));
});
