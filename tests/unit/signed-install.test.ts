import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, cp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Project, listLibrary, writeSignature } from "@secstreet/project";
import { generateEd25519KeyPair, keyIdFromPublicKey } from "@secstreet/security";
import { loadRegistry } from "@secstreet/capability";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../capabilities/official");

async function makeVerifiedFixture(tmp: string): Promise<string> {
  const src = join(LIB, "parse-auth-log");
  const dir = join(tmp, "lib-verified", "parse-auth-log");
  await cp(src, dir, { recursive: true });
  const manifestPath = join(dir, "capability.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.trust = "verified";
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return dir;
}

describe("signed install", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-sig-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("refuses to install a verified-tier capability without a signature", async () => {
    await makeVerifiedFixture(tmp);
    const p = await Project.init(join(tmp, "proj"), "proj");
    const caps = await loadRegistry(join(tmp, "lib-verified"));
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await expect(
      p.install(cap, join(tmp, "lib-verified"), { requireSignatureFor: ["verified", "restricted"] })
    ).rejects.toThrow(/no signature/);
  });

  it("refuses a signature whose keyId is not trusted for the tier", async () => {
    const dir = await makeVerifiedFixture(tmp);
    const pair = generateEd25519KeyPair();
    const manifestRaw = await readFile(join(dir, "capability.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);
    await writeSignature(dir, manifest, pair.privateKeyPem);

    const p = await Project.init(join(tmp, "proj"), "proj");
    const store = await p.loadTrustStore();
    store.addKey(keyIdFromPublicKey(pair.publicKeyPem), pair.publicKeyPem);
    await p.saveTrustStore(store);

    const caps = await loadRegistry(join(tmp, "lib-verified"));
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await expect(
      p.install(cap, join(tmp, "lib-verified"), { requireSignatureFor: ["verified", "restricted"] })
    ).rejects.toThrow(/not trusted for tier/);
  });

  it("installs a verified-tier capability when the key is trusted for that tier", async () => {
    const dir = await makeVerifiedFixture(tmp);
    const pair = generateEd25519KeyPair();
    const keyId = keyIdFromPublicKey(pair.publicKeyPem);
    const manifestRaw = await readFile(join(dir, "capability.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);
    await writeSignature(dir, manifest, pair.privateKeyPem);

    const p = await Project.init(join(tmp, "proj"), "proj");
    const store = await p.loadTrustStore();
    store.addKey(keyId, pair.publicKeyPem);
    store.trustKey("verified", keyId);
    await p.saveTrustStore(store);

    const caps = await loadRegistry(join(tmp, "lib-verified"));
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await p.install(cap, join(tmp, "lib-verified"), { requireSignatureFor: ["verified", "restricted"] });

    const rec = p.manifestData.installed["parse-auth-log"];
    expect(rec?.trustVerified).toBe(true);
    expect(rec?.signedBy).toBe(keyId);
    const [v] = await p.verify("parse-auth-log");
    expect(v.ok).toBe(true);
  });

  it("rejects tampered code even when the signature file is present", async () => {
    const dir = await makeVerifiedFixture(tmp);
    const pair = generateEd25519KeyPair();
    const keyId = keyIdFromPublicKey(pair.publicKeyPem);
    const manifestRaw = await readFile(join(dir, "capability.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);
    await writeSignature(dir, manifest, pair.privateKeyPem);

    await writeFile(join(dir, "index.js"), "\n// injected after signing\n", { flag: "a" });

    const p = await Project.init(join(tmp, "proj"), "proj");
    const store = await p.loadTrustStore();
    store.addKey(keyId, pair.publicKeyPem);
    store.trustKey("verified", keyId);
    await p.saveTrustStore(store);

    const caps = await loadRegistry(join(tmp, "lib-verified"));
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await expect(
      p.install(cap, join(tmp, "lib-verified"), { requireSignatureFor: ["verified", "restricted"] })
    ).rejects.toThrow(/signature verification failed/);
  });

  it("community-tier install does not require a signature", async () => {
    const p = await Project.init(join(tmp, "proj"), "proj");
    const caps = await listLibrary({ label: "lib", path: LIB });
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await p.install(cap, LIB, { requireSignatureFor: ["verified", "restricted"] });
    const rec = p.manifestData.installed["parse-auth-log"];
    expect(rec?.trustVerified).toBeUndefined();
    expect(rec?.integrity).toMatch(/^sha256-/);
  });
});
