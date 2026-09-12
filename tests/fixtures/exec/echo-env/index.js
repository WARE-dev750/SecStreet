let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => {
  const value = process.env.SECSTREET_TEST_KEY || "";
  process.stdout.write(JSON.stringify({ value }));
});
