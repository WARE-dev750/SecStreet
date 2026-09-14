import { describe, it, expect } from "vitest";
import { TrustStore } from "@secstreet/security";
import { generateEd25519KeyPair, keyIdFromPublicKey } from "@secstreet/security";
import { MemoryStorage } from "@secstreet/storage";
import { Project } from "@secstreet/project";

describe("TrustStore serialization", () => {
  it("round-trips through toJSON and fromJSON", () => {
    const pair = generateEd25519KeyPair();
    const keyId = keyIdFromPublicKey(pair.publicKeyPem);
    const a = TrustStore.fromJSON("{}");
    a.addKey(keyId, pair.publicKeyPem);
    a.trustKey("verified", keyId);

    const raw = a.toJSON();
    const b = TrustStore.fromJSON(raw);
    expect(b.getKey(keyId)).toBe(pair.publicKeyPem);
    expect(b.isTrustedFor("verified", keyId)).toBe(true);
    expect(b.isTrustedFor("restricted", keyId)).toBe(false);
  });

  it("survives a full Project save/load cycle over MemoryStorage", async () => {
    const storage = new MemoryStorage();
    const p = await Project.init("/virtual/proj", "virtual", storage);

    const pair = generateEd25519KeyPair();
    const keyId = keyIdFromPublicKey(pair.publicKeyPem);
    const store = await p.loadTrustStore();
    store.addKey(keyId, pair.publicKeyPem);
    store.trustKey("professional", keyId);
    await p.saveTrustStore(store);

    const raw = await storage.read(".secstreet/trust.json");
    expect(raw).toBeTruthy();
    expect(raw).toContain(keyId);

    const reopened = await Project.open("/virtual/proj", storage);
    const reloaded = await reopened.loadTrustStore();
    expect(reloaded.getKey(keyId)).toBe(pair.publicKeyPem);
    expect(reloaded.isTrustedFor("professional", keyId)).toBe(true);
  });

  it("fromJSON on empty string yields an empty store", () => {
    const s = TrustStore.fromJSON("");
    expect(s.isEmpty()).toBe(true);
  });
});
