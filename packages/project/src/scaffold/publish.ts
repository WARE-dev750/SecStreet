import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { writeSignature } from "../signature.js";

export interface PublishOptions {
  projectCapabilitiesDir: string;
  capabilityName: string;
  targetLibraryDir: string;
  privateKeyPem?: string;
}

export interface PublishResult {
  capability: string;
  version: string;
  installedTo: string;
  signed: boolean;
  keyId?: string;
}

export async function publishCapability(opts: PublishOptions): Promise<PublishResult> {
  const caps = await loadRegistry(opts.projectCapabilitiesDir);
  const cap = caps.find((c) => c.manifest.name === opts.capabilityName);
  if (!cap) throw new Error("capability not found in project: " + opts.capabilityName);

  const destDir = join(opts.targetLibraryDir, cap.manifest.name);
  if (existsSync(destDir)) throw new Error("already exists in target library: " + destDir);
  await mkdir(opts.targetLibraryDir, { recursive: true });
  await cp(cap.dir, destDir, { recursive: true });

  let signed = false;
  let keyId: string | undefined;
  if (opts.privateKeyPem) {
    const manifestRaw = await readFile(join(destDir, "capability.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);
    const sig = await writeSignature(destDir, manifest, opts.privateKeyPem);
    signed = true;
    keyId = sig.keyId;
  }

  return {
    capability: cap.manifest.name,
    version: cap.manifest.version,
    installedTo: destDir,
    signed,
    keyId,
  };
}
