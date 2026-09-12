import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityManifest } from "@secstreet/contracts";
import { hashDirectory } from "@secstreet/capability";
import {
  signPayload, verifyPayload, keyIdFromPublicKey, readPublicKeyPem,
  type SignedPayload,
} from "@secstreet/security";

export const SIGNATURE_FILE = "signature.json";

export interface SignatureRecord extends SignedPayload {}

export async function writeSignature(
  capabilityDir: string,
  manifest: CapabilityManifest,
  privateKeyPem: string
): Promise<SignatureRecord> {
  const integrity = await hashDirectory(capabilityDir);
  const signed = signPayload(manifest, integrity, privateKeyPem);
  const record: SignatureRecord = signed;
  await writeFile(join(capabilityDir, SIGNATURE_FILE), JSON.stringify(record, null, 2) + "\n", "utf8");
  return record;
}

export async function readSignature(capabilityDir: string): Promise<SignatureRecord | null> {
  try {
    const raw = await readFile(join(capabilityDir, SIGNATURE_FILE), "utf8");
    return JSON.parse(raw) as SignatureRecord;
  } catch {
    return null;
  }
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  keyId?: string;
}

export async function verifySignature(
  capabilityDir: string,
  manifest: CapabilityManifest,
  publicKeyPem: string
): Promise<VerifyResult> {
  const sig = await readSignature(capabilityDir);
  if (!sig) return { ok: false, reason: "no signature.json" };
  const integrity = await hashDirectory(capabilityDir);
  const ok = verifyPayload(manifest, integrity, publicKeyPem, sig);
  if (!ok) return { ok: false, reason: "signature invalid", keyId: sig.keyId };
  return { ok: true, keyId: sig.keyId };
}

export async function keyIdFromPublicKeyPath(publicKeyPath: string): Promise<string> {
  const pem = await readPublicKeyPem(publicKeyPath);
  return keyIdFromPublicKey(pem);
}
