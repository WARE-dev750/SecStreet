import { describe, it, expect } from "vitest";
import { generateEd25519KeyPair, keyIdFromPublicKey, publicKeyFromPrivate } from "@secstreet/security";
import { signPayload, verifyPayload } from "@secstreet/security";
import { TrustStore } from "@secstreet/security";
import type { CapabilityManifest } from "@secstreet/contracts";

const SAMPLE: CapabilityManifest = {
  name: "sample", version: "0.1.0", description: "test",
  language: "javascript", entrypoint: "index.js",
  inputSchema: "in.json", outputSchema: "out.json",
  dependencies: [], os: ["linux"], permissions: [],
  risk: "low", trust: "verified",
  provenance: { sourceRepo: "x", sourceAuthor: "y", license: "MIT", version: "0.1.0", modifications: [] },
  maintainer: "test",
};

describe("signing", () => {
  it("generates an ed25519 keypair with a stable keyId", () => {
    const pair = generateEd25519KeyPair();
    const id1 = keyIdFromPublicKey(pair.publicKeyPem);
    const id2 = keyIdFromPublicKey(pair.publicKeyPem);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("derives the public key from the private key", () => {
    const pair = generateEd25519KeyPair();
    expect(publicKeyFromPrivate(pair.privateKeyPem).trim()).toBe(pair.publicKeyPem.trim());
  });

  it("signs and verifies a manifest+integrity payload", () => {
    const pair = generateEd25519KeyPair();
    const integrity = "sha256-abc";
    const signed = signPayload(SAMPLE, integrity, pair.privateKeyPem);
    expect(verifyPayload(SAMPLE, integrity, pair.publicKeyPem, signed)).toBe(true);
  });

  it("fails verification when integrity is changed", () => {
    const pair = generateEd25519KeyPair();
    const signed = signPayload(SAMPLE, "sha256-abc", pair.privateKeyPem);
    expect(verifyPayload(SAMPLE, "sha256-xyz", pair.publicKeyPem, signed)).toBe(false);
  });

  it("fails verification when manifest is changed", () => {
    const pair = generateEd25519KeyPair();
    const signed = signPayload(SAMPLE, "sha256-abc", pair.privateKeyPem);
    const tampered: CapabilityManifest = { ...SAMPLE, trust: "restricted" };
    expect(verifyPayload(tampered, "sha256-abc", pair.publicKeyPem, signed)).toBe(false);
  });

  it("fails verification with a different public key", () => {
    const a = generateEd25519KeyPair();
    const b = generateEd25519KeyPair();
    const signed = signPayload(SAMPLE, "sha256-abc", a.privateKeyPem);
    expect(verifyPayload(SAMPLE, "sha256-abc", b.publicKeyPem, signed)).toBe(false);
  });
});

describe("trust store", () => {
  it("adds keys and trusts them per tier", () => {
    const pair = generateEd25519KeyPair();
    const keyId = keyIdFromPublicKey(pair.publicKeyPem);
    const store = new TrustStore();
    store.addKey(keyId, pair.publicKeyPem);
    store.trustKey("verified", keyId);
    expect(store.isTrustedFor("verified", keyId)).toBe(true);
    expect(store.isTrustedFor("restricted", keyId)).toBe(false);
    expect(store.getKey(keyId)).toBe(pair.publicKeyPem);
  });

  it("refuses to trust an unknown key", () => {
    const store = new TrustStore();
    expect(() => store.trustKey("verified", "deadbeef")).toThrow(/unknown keyId/);
  });
});
