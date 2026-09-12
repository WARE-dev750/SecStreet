import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  createHash,
} from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface KeyPairPem {
  privateKeyPem: string;
  publicKeyPem: string;
}

export function generateEd25519KeyPair(): KeyPairPem {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

export function keyIdFromPublicKey(publicKeyPem: string): string {
  return createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);
}

export function publicKeyFromPrivate(privateKeyPem: string): string {
  const priv = createPrivateKey(privateKeyPem);
  const pub = createPublicKey(priv);
  return pub.export({ type: "spki", format: "pem" }).toString();
}

export async function writeKeyPair(prefix: string, pair: KeyPairPem): Promise<void> {
  await mkdir(dirname(prefix), { recursive: true });
  await writeFile(prefix + ".priv.pem", pair.privateKeyPem, "utf8");
  await writeFile(prefix + ".pub.pem", pair.publicKeyPem, "utf8");
}

export async function readPrivateKeyPem(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readPublicKeyPem(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export function importPrivateKey(pem: string) {
  return createPrivateKey(pem);
}

export function importPublicKey(pem: string) {
  return createPublicKey(pem);
}
