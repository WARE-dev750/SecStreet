import type { CapabilityManifest } from "../capability/types.js";

export interface LibraryCapabilityEntry {
  name: string;
  version: string;
  path: string;
  integrity: string;
  signature: { keyId: string; sig: string; signedAt: string } | null;
  manifest: CapabilityManifest;
}

export interface LibraryIndex {
  libraryName: string;
  libraryVersion: string;
  maintainer: string;
  generatedAt: string;
  capabilities: LibraryCapabilityEntry[];
}
