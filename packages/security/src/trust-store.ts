import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { CapabilityTrust } from "@secstreet/contracts";

export interface TrustStoreData {
  keys: Record<string, string>;
  tiers: Partial<Record<CapabilityTrust, string[]>>;
}

export class TrustStore {
  private data: TrustStoreData = { keys: {}, tiers: {} };

  static async load(path: string): Promise<TrustStore> {
    const store = new TrustStore();
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as TrustStoreData;
      store.data = { keys: parsed.keys ?? {}, tiers: parsed.tiers ?? {} };
    } catch {
      // missing file → empty store
    }
    return store;
  }

  async save(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(this.data, null, 2) + "\n", "utf8");
  }

  addKey(keyId: string, publicKeyPem: string): void {
    this.data.keys[keyId] = publicKeyPem;
  }

  trustKey(tier: CapabilityTrust, keyId: string): void {
    if (!this.data.keys[keyId]) throw new Error("unknown keyId: " + keyId);
    const list = this.data.tiers[tier] ?? [];
    if (!list.includes(keyId)) list.push(keyId);
    this.data.tiers[tier] = list;
  }

  getKey(keyId: string): string | undefined {
    return this.data.keys[keyId];
  }

  isTrustedFor(tier: CapabilityTrust, keyId: string): boolean {
    return (this.data.tiers[tier] ?? []).includes(keyId);
  }

  isEmpty(): boolean {
    return Object.keys(this.data.keys).length === 0;
  }

  toJSON(): TrustStoreData {
    return this.data;
  }
}
