let raw = "";
process.stdin.on("data", (d) => (raw += d.toString()));
process.stdin.on("end", () => process.stdout.write(JSON.stringify({ branch: "b", value: 20 })));
