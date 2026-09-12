let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ data: { events: [{ id: 1 }, { id: 2 }, { id: 3 }] } }));
});
