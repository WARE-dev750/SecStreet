#!/usr/bin/env node
import { resolve, join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { runCapability, evaluatePolicy } from "@secstreet/runtime";
import { runWorkflow, checkCompatibility } from "@secstreet/workflow";
import { Project, listLibrary, searchLibrary, resolveLibraries, writeSignature, buildLibraryIndex, verifyLibraryIndex, readLibraryIndex, writeLibraryIndex, type AuditEntry } from "@secstreet/project";
import { hashJson } from "@secstreet/capability";
import { DEFAULT_POLICY, type CapabilityManifest, type CapabilityTrust } from "@secstreet/contracts";
import { generateEd25519KeyPair, keyIdFromPublicKey, readPrivateKeyPem, readPublicKeyPem } from "@secstreet/security";

function usage(): void {
  console.log("secstreet <init|list|add|remove|inspect|search|browse|run|workflow|compat|policy|check|verify|audit|keygen|trust|keys|sign|lib>");
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
    if (a === "--library" || a === "--input" || a === "--tail" || a === "--key-name") { i++; continue; }
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
function auditFor(
  manifest: CapabilityManifest, integrity: string, input: unknown, outcome: AuditEntry["outcome"],
  exitCode: number, durationMs: number, output: unknown,
  opts: { workflow?: string; stepId?: string; kind?: AuditEntry["kind"] } = {}
): AuditEntry {
  return {
    ts: new Date().toISOString(), kind: opts.kind ?? "run",
    capability: manifest.name, version: manifest.version, integrity,
    trust: manifest.trust, declared: manifest.permissions as string[],
    inputHash: hashJson(input), outputHash: output === undefined ? "" : hashJson(output),
    exitCode, durationMs, outcome, workflow: opts.workflow, stepId: opts.stepId,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0]; const rest = argv.slice(1);
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
      const sig = rec?.trustVerified ? "SIGNED" : "      ";
      console.log(sig + "  " + c.manifest.name + "\t" + c.manifest.version + "\t" + c.manifest.trust + "\t" + (rec ? rec.source : "?"));
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
      await p.install(cap, lib.path, { requireSignatureFor: ["verified", "restricted"] });
      const rec = p.manifestData.installed[name];
      const extra = rec?.trustVerified ? " (signature verified)" : "";
      console.log("installed " + name + "@" + cap.manifest.version + " from " + lib.path + extra);
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
      for (const r of rs) { any = true; console.log(r.manifest.name + "\t" + r.manifest.version + "\t" + r.manifest.trust + "\t" + lib.path); }
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
      for (const c of caps) console.log(c.manifest.name + "\t" + c.manifest.version + "\t" + c.manifest.trust + "\t" + lib.path);
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
  if (cmd === "audit") {
    const p = await openProjectOrFail();
    const jsonFlag = rest.includes("--json");
    const tailFlag = getFlag(rest, "--tail");
    const n = tailFlag ? Number(tailFlag) : 20;
    const entries = await p.tailAudit(n);
    if (!entries.length) { console.log("(no audit entries)"); return; }
    if (jsonFlag) { for (const e of entries) console.log(JSON.stringify(e)); return; }
    for (const e of entries) {
      const when = e.ts.replace("T", " ").slice(0, 19);
      const tag = e.outcome === "ok" ? "OK  " : e.outcome.toUpperCase().padEnd(16);
      const wf = e.workflow ? " [" + e.workflow + (e.stepId ? ":" + e.stepId : "") + "]" : "";
      console.log(tag + "  " + when + "  " + e.capability + "@" + e.version + "  exit=" + e.exitCode + "  " + e.durationMs + "ms" + wf);
    }
    return;
  }
  if (cmd === "keygen") {
    const name = positionals(rest)[0];
    if (!name) { console.error("usage: keygen <name>"); process.exit(2); }
    const p = await openProjectOrFail();
    await mkdir(p.keysDir, { recursive: true });
    const pair = generateEd25519KeyPair();
    const keyId = keyIdFromPublicKey(pair.publicKeyPem);
    await writeFile(join(p.keysDir, name + ".priv.pem"), pair.privateKeyPem, "utf8");
    await writeFile(join(p.keysDir, name + ".pub.pem"), pair.publicKeyPem, "utf8");
    const store = await p.loadTrustStore();
    store.addKey(keyId, pair.publicKeyPem);
    await p.saveTrustStore(store);
    console.log("generated key " + name + "  keyId=" + keyId);
    console.log("next: secstreet trust <tier> " + name);
    return;
  }
  if (cmd === "trust") {
    const tier = positionals(rest)[0] as CapabilityTrust | undefined;
    const keyName = positionals(rest)[1];
    if (!tier || !keyName) { console.error("usage: trust <tier> <keyName>"); process.exit(2); }
    if (!["community", "professional", "verified", "restricted"].includes(tier)) {
      console.error("tier must be community|professional|verified|restricted"); process.exit(2);
    }
    const p = await openProjectOrFail();
    const pubPem = await readPublicKeyPem(join(p.keysDir, keyName + ".pub.pem"));
    const keyId = keyIdFromPublicKey(pubPem);
    const store = await p.loadTrustStore();
    if (!store.getKey(keyId)) store.addKey(keyId, pubPem);
    store.trustKey(tier, keyId);
    await p.saveTrustStore(store);
    console.log("trusted " + keyName + " (" + keyId + ") for tier " + tier);
    return;
  }
  if (cmd === "keys") {
    const p = await openProjectOrFail();
    const store = await p.loadTrustStore();
    const data = store.toJSON();
    const tierOf: Record<string, string[]> = {};
    for (const [tier, ids] of Object.entries(data.tiers)) {
      for (const id of ids ?? []) {
        tierOf[id] = tierOf[id] ?? [];
        tierOf[id]!.push(tier);
      }
    }
    if (Object.keys(data.keys).length === 0) { console.log("(no keys)"); return; }
    for (const [keyId, pem] of Object.entries(data.keys)) {
      const tiers = (tierOf[keyId] ?? []).join(",") || "-";
      console.log(keyId + "\t" + tiers + "\t" + pem.split("\n")[1]?.slice(0, 24) + "...");
    }
    return;
  }
  if (cmd === "sign") {
    const capDir = positionals(rest)[0];
    const keyName = getFlag(rest, "--key-name");
    if (!capDir || !keyName) { console.error("usage: sign <capability-dir> --key-name <name>"); process.exit(2); }
    const p = await openProjectOrFail();
    const absCap = resolve(process.cwd(), capDir);
    const manifestRaw = await readFile(join(absCap, "capability.json"), "utf8");
    const manifest = JSON.parse(manifestRaw) as CapabilityManifest;
    const privPem = await readPrivateKeyPem(join(p.keysDir, keyName + ".priv.pem"));
    const sig = await writeSignature(absCap, manifest, privPem);
    console.log("signed " + manifest.name + "@" + manifest.version + " with key " + keyName + " (keyId=" + sig.keyId + ")");
    return;
  }
  if (cmd === "lib") {
    const sub = positionals(rest)[0];
    if (sub === "index") {
      const libDir = getFlag(rest, "--library");
      const outPath = getFlag(rest, "--out");
      const keyName = getFlag(rest, "--key-name");
      const libName = getFlag(rest, "--name") ?? "library";
      const libVersion = getFlag(rest, "--version") ?? "0.1.0";
      const maintainer = getFlag(rest, "--maintainer") ?? "unknown";
      if (!libDir || !outPath || !keyName) {
        console.error("usage: lib index --library <dir> --out <file> --key-name <name> [--name <n>] [--version <v>] [--maintainer <m>]");
        process.exit(2);
      }
      const p = await openProjectOrFail();
      const privPem = await readPrivateKeyPem(join(p.keysDir, keyName + ".priv.pem"));
      const idx = await buildLibraryIndex({
        libraryName: libName, libraryVersion: libVersion, maintainer,
        libraryDir: resolve(process.cwd(), libDir), privateKeyPem: privPem,
      });
      await writeLibraryIndex(resolve(process.cwd(), outPath), idx);
      console.log("wrote index " + outPath + " with " + idx.capabilities.length + " capabilities");
      return;
    }
    if (sub === "verify") {
      const idxPath = positionals(rest)[1];
      const libDir = getFlag(rest, "--library");
      const keyName = getFlag(rest, "--key-name");
      if (!idxPath || !libDir || !keyName) {
        console.error("usage: lib verify <index.json> --library <dir> --key-name <name>");
        process.exit(2);
      }
      const p = await openProjectOrFail();
      const pubPem = await readPublicKeyPem(join(p.keysDir, keyName + ".pub.pem"));
      const idx = await readLibraryIndex(resolve(process.cwd(), idxPath));
      const r = await verifyLibraryIndex(idx, resolve(process.cwd(), libDir), pubPem);
      if (r.ok) {
        console.log("OK  " + idx.libraryName + "@" + idx.libraryVersion + "  " + r.total + " capabilities verified");
        return;
      }
      for (const f of r.failures) console.error("FAIL  " + f.name + ": " + f.reason);
      process.exit(1);
    }
    console.error("usage: lib <index|verify>");
    process.exit(2);
  }
  if (cmd === "run") {
    const name = positionals(rest)[0];
    const inputArg = getFlag(rest, "--input");
    if (!name || !inputArg) { console.error("usage: run <name> --input <json-or-file>"); process.exit(2); }
    const p = await openProjectOrFail();
    const caps = await p.loadInstalled();
    const c = caps.find((x) => x.manifest.name === name);
    if (!c) { console.error("not installed: " + name); process.exit(1); }
    let input: unknown;
    try { input = JSON.parse(await readFile(inputArg, "utf8")); }
    catch { input = JSON.parse(inputArg); }
    const rec = p.manifestData.installed[name];
    const recordedIntegrity = rec?.integrity ?? "";
    const verified = await p.verify(name);
    if (!verified[0]?.ok) {
      await p.recordAudit(auditFor(c.manifest, recordedIntegrity, input, "denied-integrity", 4, 0, undefined));
      console.error("integrity check failed for " + name + " — reinstall with: secstreet remove " + name + " && secstreet add " + name);
      process.exit(4);
    }
    const r = await runCapability({ capabilityDir: c.dir, manifest: c.manifest, input });
    if (!r.ok) {
      const outcome = r.deniedByPolicy ? "denied-policy" : "error";
      await p.recordAudit(auditFor(c.manifest, recordedIntegrity, input, outcome, r.exitCode, r.durationMs, undefined));
      if (r.deniedByPolicy) console.error("denied by policy: " + r.deniedByPolicy.reason);
      else process.stderr.write(r.stderr);
      process.exit(r.exitCode || 1);
    }
    const parsed = r.stdout.trim() ? JSON.parse(r.stdout) : undefined;
    await p.recordAudit(auditFor(c.manifest, recordedIntegrity, input, "ok", 0, r.durationMs, parsed));
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
      const capsInstalled = await p.loadInstalled();
      for (const b of bad) {
        const c = capsInstalled.find((x) => x.manifest.name === b.name);
        const rec = p.manifestData.installed[b.name];
        if (c) await p.recordAudit(auditFor(c.manifest, rec?.integrity ?? "", {}, "denied-integrity", 4, 0, undefined, { kind: "workflow-step", workflow: file, stepId: b.name }));
      }
      console.error("integrity check failed for: " + bad.map((r) => r.name).join(", "));
      process.exit(4);
    }
    const r = await runWorkflow({ workflowPath: resolve(process.cwd(), file), capabilitiesDir: p.capabilitiesDir });
    const capsByName = new Map((await p.loadInstalled()).map((c) => [c.manifest.name, c]));
    for (const s of r.steps) {
      const c = capsByName.get(s.capability);
      if (!c) continue;
      const rec = p.manifestData.installed[s.capability];
      const outcome: AuditEntry["outcome"] = s.ok ? "ok" : (s.error?.startsWith("policy denied") ? "denied-policy" : "error");
      await p.recordAudit(auditFor(c.manifest, rec?.integrity ?? "", s.output ?? {}, outcome, s.ok ? 0 : 1, s.durationMs, s.output, { kind: "workflow-step", workflow: r.name, stepId: s.id }));
    }
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
  if (cmd === "policy") { console.log(JSON.stringify(DEFAULT_POLICY, null, 2)); return; }
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
