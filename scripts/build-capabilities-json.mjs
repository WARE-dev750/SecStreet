// Reads capabilities/official/*/capability.json and each capability's
// schemas + entrypoint, and writes one static JSON file the library page
// can consume without a backend. Run: node scripts/build-capabilities-json.mjs
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "capabilities/official");
const OUT = resolve(process.cwd(), "apps/web/public/capabilities.json");

async function main() {
  const dirs = await readdir(ROOT);
  const out = [];
  for (const name of dirs) {
    const dir = join(ROOT, name);
    const manifestRaw = await readFile(join(dir, "capability.json"), "utf8").catch(() => null);
    if (!manifestRaw) continue;
    const manifest = JSON.parse(manifestRaw);
    const inputSchema = JSON.parse(await readFile(join(dir, manifest.inputSchema), "utf8").catch(() => "{}"));
    const outputSchema = JSON.parse(await readFile(join(dir, manifest.outputSchema), "utf8").catch(() => "{}"));
    const entrypointCode = await readFile(join(dir, manifest.entrypoint), "utf8").catch(() => "");
    out.push({ manifest, inputSchema, outputSchema, entrypointCode });
  }
  out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("wrote " + out.length + " capabilities to " + OUT);
  const kb = (JSON.stringify(out).length / 1024).toFixed(1);
  console.log("size: " + kb + " KB");
}

main().catch((e) => { console.error(e); process.exit(1); });
