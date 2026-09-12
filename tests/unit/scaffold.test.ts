import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { scaffoldCapability } from "@secstreet/project";
import { publishCapability, verifySignature } from "@secstreet/project";
import { loadRegistry, hashDirectory } from "@secstreet/capability";
import { generateEd25519KeyPair, readPublicKeyPem, keyIdFromPublicKey } from "@secstreet/security";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../capabilities/official");

describe("scaffold + publish", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-scaf-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("scaffolds a javascript capability that the registry accepts", async () => {
    const dir = await scaffoldCapability({
      root: tmp, name: "my-cap", description: "test cap",
      language: "javascript", maintainer: "me", author: "me", license: "MIT",
    });
    const caps = await loadRegistry(tmp);
    expect(caps.map((c) => c.manifest.name)).toContain("my-cap");
    expect(caps[0].manifest.entrypoint).toBe("index.js");
  });

  it("scaffolds a python capability with main.py entrypoint", async () => {
    await scaffoldCapability({
      root: tmp, name: "py-cap", description: "test",
      language: "python", maintainer: "me", author: "me", license: "MIT",
    });
    const caps = await loadRegistry(tmp);
    expect(caps[0].manifest.entrypoint).toBe("main.py");
  });

  it("scaffold refuses to overwrite an existing capability", async () => {
    await scaffoldCapability({ root: tmp, name: "x", description: "x", language: "javascript", maintainer: "m", author: "a", license: "MIT" });
    await expect(scaffoldCapability({ root: tmp, name: "x", description: "x", language: "javascript", maintainer: "m", author: "a", license: "MIT" }))
      .rejects.toThrow(/already exists/);
  });

  it("publishes a capability from a project to a library, unsigned", async () => {
    const proj = join(tmp, "proj"); await mkdirProject(proj);
    const srcCaps = await loadRegistry(LIB);
    const parse = srcCaps.find((c) => c.manifest.name === "parse-auth-log")!;
    await import("node:fs/promises").then((fs) => fs.cp(parse.dir, join(proj, "capabilities", "parse-auth-log"), { recursive: true }));

    const r = await publishCapability({
      projectCapabilitiesDir: join(proj, "capabilities"),
      capabilityName: "parse-auth-log",
      targetLibraryDir: join(tmp, "lib"),
    });
    expect(r.signed).toBe(false);
    const published = await loadRegistry(join(tmp, "lib"));
    expect(published.map((c) => c.manifest.name)).toContain("parse-auth-log");
  });

  it("publishes and signs, producing a verifiable signature", async () => {
    const proj = join(tmp, "proj"); await mkdirProject(proj);
    const srcCaps = await loadRegistry(LIB);
    const parse = srcCaps.find((c) => c.manifest.name === "parse-auth-log")!;
    await import("node:fs/promises").then((fs) => fs.cp(parse.dir, join(proj, "capabilities", "parse-auth-log"), { recursive: true }));

    const pair = generateEd25519KeyPair();
    const r = await publishCapability({
      projectCapabilitiesDir: join(proj, "capabilities"),
      capabilityName: "parse-auth-log",
      targetLibraryDir: join(tmp, "lib"),
      privateKeyPem: pair.privateKeyPem,
    });
    expect(r.signed).toBe(true);
    expect(r.keyId).toBe(keyIdFromPublicKey(pair.publicKeyPem));

    const destDir = join(tmp, "lib", "parse-auth-log");
    const manifestRaw = await import("node:fs/promises").then((fs) => fs.readFile(join(destDir, "capability.json"), "utf8"));
    const manifest = JSON.parse(manifestRaw);
    const v = await verifySignature(destDir, manifest, pair.publicKeyPem);
    expect(v.ok).toBe(true);
  });
});

async function mkdirProject(root: string) {
  const fs = await import("node:fs/promises");
  await fs.mkdir(join(root, "capabilities"), { recursive: true });
  await fs.mkdir(join(root, "workflows"), { recursive: true });
  await fs.writeFile(join(root, "secstreet.json"), JSON.stringify({ name: "proj", version: "0.0.1", installed: {} }, null, 2) + "\n");
}
