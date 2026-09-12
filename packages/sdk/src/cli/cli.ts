#!/usr/bin/env node
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { runCapability, evaluatePolicy } from "@secstreet/runtime";
import { runWorkflow, checkCompatibility } from "@secstreet/workflow";
import { Project, listLibrary, searchLibrary, resolveLibraries } from "@secstreet/project";
import { DEFAULT_POLICY } from "@secstreet/contracts";

function usage(): void {
  console.log("secstreet <init|list|add|remove|inspect|search|browse|run|workflow|compat|policy|check|verify>");
}

function getFlag(args: string[], flag: string): string | null {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  if (!v) throw new Error(flag + " requires value");
  return v;
}

function positionals(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "--library" || a === "--input") { i++; continue; }
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}

async function openProjectOrFail(): Promise<Project> {
  const root = Project.findRoot(process.cwd());
  if (!root) throw new Error("not inside a SecStreet project (no secstreet.json)");
  return Project.open(root);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (!cmd || cmd === "-h" || cmd === "--help") return usage();

  if (cmd === "init") {
    const name = positionals(rest)[0];
    if (!name) { console.error("usage: init <name>"); process.exit(2); }
    const p = await Project.init(resolve(process.cwd(), name), name);
    console.log("created " + name + " at " + p.root);
    return;
  }

  if (cmd === "list") {
    const p = await openProjectOrFail();
    const caps = await p.loadInstalled();
    if (!caps.length) { console.log("(no capabilities installed)"); return; }
    for (const c of caps) {
      const rec = p.manifestData.installed[c.manifest.name];
      console.log(c.manifest.name + "\t" + c.manifest.version + "\t" + c.manifest.risk + "\t" + (rec ? rec.source : "?"));
    }
    return;
  }

  if (cmd === "add") {
    const name = positionals(rest)[0];
    if (!name) { console.error("usage: add <name> --library <path>"); process.exit(2); }
    const libFlag = getFlag(rest, "--library");
    const libs = resolveLibraries(libFlag ? [libFlag] : []);
    if (!libs.length) throw new Error("no library provided (--library or SECSTREET_LIBRARY)");
    const p = await openProjectOrFail();
    for (const lib of libs) {
      const caps = await listLibrary(lib);
      const cap = caps.find((c) => c.manifest.name === name);
      if (!cap) continue;
      await p.install(cap, lib.path);
      console.log("installed " + name + "@" + cap.manifest.version + " from " + lib.path);
      return;
    }
    console.error("not found in any library: " + name);
    process.exit(1);
  }

  if (cmd === "remove") {
    const name = positionals(rest)[0];
    if (!name) { console.error("usage: remove <name>"); process.exit(2); }
    const p = await openProjectOrFail();
    await p.remove(name);
    console.log("removed " + name);
    return;
  }

  if (cmd === "inspect") {
    const name = positionals(rest)[0];
    if (!name) { console.error("usage: inspect <name>"); process.exit(2); }
    const p = await openProjectOrFail();
    const caps = await p.loadInstalled();
    const c = caps.find((x) => x.manifest.name === name);
    if (!c) { console.error("not installed: " + name); process.exit(1); }
    console.log(JSON.stringify(c.manifest, null, 2));
    return;
  }

  if (cmd === "search") {
    const q = positionals(rest).join(" ");
    if (!q) { console.error("usage: search <query> --library <path>"); process.exit(2); }
    const libFlag = getFlag(rest, "--library");
    const libs = resolveLibraries(libFlag ? [libFlag] : []);
    if (!libs.length) throw new Error("no library provided");
    let any = false;
    for (const lib of libs) {
      const rs = await searchLibrary(lib, q);
      for (const r of rs) { any = true; console.log(r.manifest.name + "\t" + r.manifest.version + "\t" + r.manifest.risk + "\t" + lib.path); }
    }
    if (!any) { console.log("(no matches)"); process.exit(1); }
    return;
  }

  if (cmd === "browse") {
    const libFlag = getFlag(rest, "--library");
    const libs = resolveLibraries(libFlag ? [libFlag] : []);
    if (!libs.length) throw new Error("no library provided");
    for (const lib of libs) {
      const caps = await listLibrary(lib);
      for (const c of caps) console.log(c.manifest.name + "\t" + c.manifest.version + "\t" + c.manifest.risk + "\t" + lib.path);
    }
    return;
  }

  if (cmd === "verify") {
    const name = positionals(rest)[0];
    const p = await openProjectOrFail();
    const results = await p.verify(name);
    if (!results.length) { console.log("(nothing installed)"); return; }
    let ok = true;
    for (const r of results) {
      console.log((r.ok ? "OK  " : "FAIL") + "  " + r.name + "\t" + r.actual.slice(0, 20) + "...");
      if (!r.ok) ok = false;
    }
    process.exit(ok ? 0 : 1);
  }

  if (cmd === "run") {
    const name = positionals(rest)[0];
    const inputArg = getFlag(rest, "--input");
    if (!name || !inputArg) { console.error("usage: run <name> --input <json-or-file>"); process.exit(2); }
    const p = await openProjectOrFail();
    const verified = await p.verify(name);
    if (!verified[0]?.ok) {
      console.error("integrity check failed for " + name + " — reinstall with: secstreet remove " + name + " && secstreet add " + name);
      process.exit(4);
    }
    const caps = await p.loadInstalled();
    const c = caps.find((x) => x.manifest.name === name);
    if (!c) { console.error("not installed: " + name); process.exit(1); }
    let input: unknown;
    try { input = JSON.parse(await readFile(inputArg, "utf8")); }
    catch { input = JSON.parse(inputArg); }
    const r = await runCapability({ capabilityDir: c.dir, manifest: c.manifest, input });
    if (!r.ok) {
      if (r.deniedByPolicy) console.error("denied by policy: " + r.deniedByPolicy.reason);
      else process.stderr.write(r.stderr);
      process.exit(r.exitCode || 1);
    }
    process.stdout.write(r.stdout.endsWith("\n") ? r.stdout : r.stdout + "\n");
    return;
  }

  if (cmd === "workflow") {
    const file = positionals(rest)[0];
    if (!file) { console.error("usage: workflow <file.json>"); process.exit(2); }
    const p = await openProjectOrFail();
    const all = await p.verify();
    const bad = all.filter((r) => !r.ok);
    if (bad.length) {
      console.error("integrity check failed for: " + bad.map((r) => r.name).join(", "));
      process.exit(4);
    }
    const r = await runWorkflow({ workflowPath: resolve(process.cwd(), file), capabilitiesDir: p.capabilitiesDir });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  if (cmd === "compat") {
    const a = positionals(rest)[0];
    const b = positionals(rest)[1];
    if (!a || !b) { console.error("usage: compat <producer> <consumer>"); process.exit(2); }
    const p = await openProjectOrFail();
    const caps = await p.loadInstalled();
    const producer = caps.find((x) => x.manifest.name === a);
    const consumer = caps.find((x) => x.manifest.name === b);
    if (!producer) { console.error("not installed: " + a); process.exit(1); }
    if (!consumer) { console.error("not installed: " + b); process.exit(1); }
    const r = await checkCompatibility(producer, consumer);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  if (cmd === "policy") {
    console.log(JSON.stringify(DEFAULT_POLICY, null, 2));
    return;
  }

  if (cmd === "check") {
    const name = positionals(rest)[0];
    if (!name) { console.error("usage: check <name>"); process.exit(2); }
    const p = await openProjectOrFail();
    const caps = await p.loadInstalled();
    const c = caps.find((x) => x.manifest.name === name);
    if (!c) { console.error("not installed: " + name); process.exit(1); }
    const d = evaluatePolicy(c.manifest, DEFAULT_POLICY);
    console.log(JSON.stringify(d, null, 2));
    process.exit(d.allowed ? 0 : 1);
  }

  usage();
  process.exit(2);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
