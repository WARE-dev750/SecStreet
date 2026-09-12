#!/usr/bin/env node
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";
import { runWorkflow, checkCompatibility } from "@secstreet/workflow";

const CAPS_DIR = resolve(process.cwd(), "capabilities", "official");

function usage(): void {
  console.log(`secstreet <command>

Commands:
  list
  inspect <name>
  run <name> --input <json-or-file>
  compat <producer> <consumer>
  workflow <file.json>
`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help") return usage();

  if (cmd === "list") {
    const caps = await loadRegistry(CAPS_DIR);
    if (!caps.length) { console.log("(no capabilities found)"); return; }
    for (const c of caps) {
      console.log(`${c.manifest.name}\t${c.manifest.version}\t${c.manifest.risk}\t${c.manifest.description}`);
    }
    return;
  }

  if (cmd === "inspect") {
    const name = rest[0];
    if (!name) { console.error("usage: inspect <name>"); process.exit(2); }
    const caps = await loadRegistry(CAPS_DIR);
    const c = caps.find((x) => x.manifest.name === name);
    if (!c) { console.error(`not found: ${name}`); process.exit(1); }
    console.log(JSON.stringify(c.manifest, null, 2));
    return;
  }

  if (cmd === "run") {
    const name = rest[0];
    const flagIdx = rest.indexOf("--input");
    const inputArg = flagIdx >= 0 ? rest[flagIdx + 1] : undefined;
    if (!name || !inputArg) { console.error("usage: run <name> --input <json-or-file>"); process.exit(2); }
    const caps = await loadRegistry(CAPS_DIR);
    const c = caps.find((x) => x.manifest.name === name);
    if (!c) { console.error(`not found: ${name}`); process.exit(1); }
    let input: unknown;
    try { input = JSON.parse(await readFile(inputArg, "utf8")); }
    catch { input = JSON.parse(inputArg); }
    const result = await runCapability({ capabilityDir: c.dir, manifest: c.manifest, input });
    if (!result.ok) { process.stderr.write(result.stderr); process.exit(result.exitCode || 1); }
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : result.stdout + "\n");
    return;
  }

  if (cmd === "compat") {
    const [producerName, consumerName] = rest;
    if (!producerName || !consumerName) { console.error("usage: compat <producer> <consumer>"); process.exit(2); }
    const caps = await loadRegistry(CAPS_DIR);
    const producer = caps.find((x) => x.manifest.name === producerName);
    const consumer = caps.find((x) => x.manifest.name === consumerName);
    if (!producer) { console.error(`not found: ${producerName}`); process.exit(1); }
    if (!consumer) { console.error(`not found: ${consumerName}`); process.exit(1); }
    const result = await checkCompatibility(producer, consumer);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === "workflow") {
    const file = rest[0];
    if (!file) { console.error("usage: workflow <file.json>"); process.exit(2); }
    const result = await runWorkflow({ workflowPath: file, capabilitiesDir: CAPS_DIR });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  usage();
  process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
