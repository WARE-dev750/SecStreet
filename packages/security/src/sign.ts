import { sign as edSign, verify as edVerify } from "node:crypto";
import type { CapabilityManifest } from "@secstreet/contracts";
import { hashJson } from "@secstreet/capability";
import { importPrivateKey, importPublicKey, keyIdFromPublicKey, publicKeyFromPrivate } from "./keys.js";

export interface SignedPayload {
  keyId: string;
  sig: string;
  signedAt: string;
}

export function payloadFor(manifest: CapabilityManifest, integrity: string): string {
  return hashJson({ manifest, integrity });
}

export function signPayload(
  manifest: CapabilityManifest,
  integrity: string,
  privateKeyPem: string
): SignedPayload {
  const payload = payloadFor(manifest, integrity);
  const key = importPrivateKey(privateKeyPem);
  const sig = edSign(null, Buffer.from(payload), key).toString("base64");
  const publicPem = publicKeyFromPrivate(privateKeyPem);
  return {
    keyId: keyIdFromPublicKey(publicPem),
    sig,
    signedAt: new Date().toISOString(),
  };
}

export function verifyPayload(
  manifest: CapabilityManifest,
  integrity: string,
  publicKeyPem: string,
  signed: SignedPayload
): boolean {
  try {
    const payload = payloadFor(manifest, integrity);
    const key = importPublicKey(publicKeyPem);
    return edVerify(null, Buffer.from(payload), key, Buffer.from(signed.sig, "base64"));
  } catch {
    return false;
  }
}
