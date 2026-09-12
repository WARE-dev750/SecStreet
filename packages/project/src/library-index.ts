import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { LibraryIndex, LibraryCapabilityEntry } from "@secstreet/contracts";
import { hashDirectory, loadRegistry } from "@secstreet/capability";
import { signPayload, verifyPayload } from "@secstreet/security";

export interface BuildIndexOptions {
  libraryName: string;
  libraryVersion: string;
  maintainer: string;
  libraryDir: string;
  privateKeyPem: string;
}

export async function buildLibraryIndex(opts: BuildIndexOptions): Promise<LibraryIndex> {
  const caps = await loadRegistry(opts.libraryDir);
  const entries: LibraryCapabilityEntry[] = [];
  for (const cap of caps) {
    const integrity = await hashDirectory(cap.dir);
    const signed = signPayload(cap.manifest, integrity, opts.privateKeyPem);
    entries.push({
      name: cap.manifest.name,
      version: cap.manifest.version,
      path: relative(opts.libraryDir, cap.dir).split(/[\\/]/).join("/"),
      integrity,
      signature: { keyId: signed.keyId, sig: signed.sig, signedAt: signed.signedAt },
      manifest: cap.manifest,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return {
    libraryName: opts.libraryName,
    libraryVersion: opts.libraryVersion,
    maintainer: opts.maintainer,
    generatedAt: new Date().toISOString(),
    capabilities: entries,
  };
}

export interface VerifyIndexResult {
  ok: boolean;
  total: number;
  failures: Array<{ name: string; reason: string }>;
}

export async function verifyLibraryIndex(
  index: LibraryIndex,
  libraryDir: string,
  publicKeyPem: string
): Promise<VerifyIndexResult> {
  const failures: Array<{ name: string; reason: string }> = [];
  for (const entry of index.capabilities) {
    const dir = join(libraryDir, entry.path);
    try {
      const integrity = await hashDirectory(dir);
      if (integrity !== entry.integrity) {
        failures.push({ name: entry.name, reason: "integrity mismatch" });
        continue;
      }
      if (!entry.signature) {
        failures.push({ name: entry.name, reason: "no signature in index" });
        continue;
      }
      const ok = verifyPayload(entry.manifest, integrity, publicKeyPem, entry.signature);
      if (!ok) failures.push({ name: entry.name, reason: "signature invalid" });
    } catch (err) {
      failures.push({ name: entry.name, reason: (err as Error).message });
    }
  }
  return { ok: failures.length === 0, total: index.capabilities.length, failures };
}

export async function readLibraryIndex(path: string): Promise<LibraryIndex> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as LibraryIndex;
}

export async function writeLibraryIndex(path: string, index: LibraryIndex): Promise<void> {
  await writeFile(path, JSON.stringify(index, null, 2) + "\n", "utf8");
}
