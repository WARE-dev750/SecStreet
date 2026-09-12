let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => {
  const { data } = JSON.parse(raw || "{}");
  if (!data || typeof data !== "object") { process.stderr.write("input.data must be an object"); process.exit(1); }
  process.stdout.write(JSON.stringify({ events: data.events ?? [] }));
});
