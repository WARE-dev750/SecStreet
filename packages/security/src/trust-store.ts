import type { CapabilityTrust } from "@secstreet/contracts";

export interface TrustStoreData {
  keys: Record<string, string>;
  tiers: Partial<Record<CapabilityTrust, string[]>>;
}

// TrustStore no longer touches the filesystem. It serializes to and from
// JSON strings. Project.loadTrustStore reads the string via Storage and
// hands it here. This makes the trust store portable alongside the project
// config and the audit log.
export class TrustStore {
  private data: TrustStoreData = { keys: {}, tiers: {} };

  static fromJSON(raw: string): TrustStore {
    const store = new TrustStore();
    try {
      const parsed = JSON.parse(raw) as TrustStoreData;
      store.data = { keys: parsed.keys ?? {}, tiers: parsed.tiers ?? {} };
    } catch {
      // empty store on malformed input
    }
    return store;
  }

  toJSON(): string {
    return JSON.stringify(this.data, null, 2) + "\n";
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

  toData(): TrustStoreData {
    return this.data;
  }
}
