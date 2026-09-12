import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildLibraryIndex, verifyLibraryIndex } from "@secstreet/project";
import { generateEd25519KeyPair, keyIdFromPublicKey } from "@secstreet/security";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../capabilities/official");

describe("library index", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-idx-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("builds an index with an entry per capability, all signed", async () => {
    const pair = generateEd25519KeyPair();
    const keyId = keyIdFromPublicKey(pair.publicKeyPem);
    const idx = await buildLibraryIndex({
      libraryName: "official", libraryVersion: "0.1.0", maintainer: "SecStreet",
      libraryDir: LIB, privateKeyPem: pair.privateKeyPem,
    });
    expect(idx.capabilities.length).toBeGreaterThanOrEqual(4);
    for (const c of idx.capabilities) {
      expect(c.integrity).toMatch(/^sha256-/);
      expect(c.signature?.keyId).toBe(keyId);
    }
    const names = idx.capabilities.map((c) => c.name);
    expect(names).toContain("parse-auth-log");
    expect(names).toContain("uname-info");
    expect(names).toEqual([...names].sort());
  });

  it("verifies an index built from the same library", async () => {
    const pair = generateEd25519KeyPair();
    const idx = await buildLibraryIndex({
      libraryName: "official", libraryVersion: "0.1.0", maintainer: "SecStreet",
      libraryDir: LIB, privateKeyPem: pair.privateKeyPem,
    });
    const r = await verifyLibraryIndex(idx, LIB, pair.publicKeyPem);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("fails verification after tampering with a capability file", async () => {
    const libCopy = join(tmp, "lib");
    await cp(LIB, libCopy, { recursive: true });
    const pair = generateEd25519KeyPair();
    const idx = await buildLibraryIndex({
      libraryName: "official", libraryVersion: "0.1.0", maintainer: "SecStreet",
      libraryDir: libCopy, privateKeyPem: pair.privateKeyPem,
    });
    await writeFile(join(libCopy, "parse-auth-log", "index.js"), "\n// tampered\n", { flag: "a" });
    const r = await verifyLibraryIndex(idx, libCopy, pair.publicKeyPem);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.name === "parse-auth-log" && f.reason === "integrity mismatch")).toBe(true);
  });

  it("fails verification with the wrong public key", async () => {
    const pair = generateEd25519KeyPair();
    const other = generateEd25519KeyPair();
    const idx = await buildLibraryIndex({
      libraryName: "official", libraryVersion: "0.1.0", maintainer: "SecStreet",
      libraryDir: LIB, privateKeyPem: pair.privateKeyPem,
    });
    const r = await verifyLibraryIndex(idx, LIB, other.publicKeyPem);
    expect(r.ok).toBe(false);
    expect(r.failures[0]?.reason).toBe("signature invalid");
  });
});
