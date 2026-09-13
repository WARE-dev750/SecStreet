import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";

const here = dirname(fileURLToPath(import.meta.url));
const OFFICIAL = resolve(here, "../../capabilities/official");

let tmp: string;
let certPath: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "secstreet-x509-"));
  certPath = join(tmp, "cert.pem");
  const r = spawnSync("openssl", [
    "req", "-x509", "-newkey", "ec",
    "-pkeyopt", "ec_paramgen_curve:prime256v1",
    "-nodes", "-keyout", "/dev/null",
    "-out", certPath, "-days", "1",
    "-subj", "/CN=test.example.com",
    "-addext", "subjectAltName=DNS:test.example.com,DNS:www.test.example.com"
  ], { encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) throw new Error("failed to generate cert: " + r.stderr);
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function runOne(name: string, input: unknown) {
  const caps = await loadRegistry(OFFICIAL);
  const cap = caps.find((c) => c.manifest.name === name);
  if (!cap) throw new Error("missing capability: " + name);
  return runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input });
}

describe("openssl-x509-info", () => {
  it("parses a self-signed certificate and extracts the CN", async () => {
    const r = await runOne("openssl-x509-info", { path: certPath });
    expect(r.ok).toBe(true);
    const c = JSON.parse(r.stdout);
    expect(c.subject).toContain("CN=test.example.com");
    expect(c.issuer).toContain("CN=test.example.com"); // self-signed
    expect(c.serial.length).toBeGreaterThan(0);
    expect(c.notBefore).toBeTruthy();
    expect(c.notAfter).toBeTruthy();
    expect(c.publicKeyAlgorithm).toMatch(/EC|id-ecPublicKey|ED25519/i);
    expect(c.signatureAlgorithm.length).toBeGreaterThan(0);
  });

  it("extracts subject alternative names", async () => {
    const r = await runOne("openssl-x509-info", { path: certPath });
    expect(r.ok).toBe(true);
    const c = JSON.parse(r.stdout);
    expect(c.subjectAltNames).toContain("test.example.com");
    expect(c.subjectAltNames).toContain("www.test.example.com");
  });

  it("rejects a path starting with '-'", async () => {
    const r = await runOne("openssl-x509-info", { path: "-in" });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must not start with/);
  });

  it("rejects a non-certificate file", async () => {
    const r = await runOne("openssl-x509-info", { path: "/etc/hostname" });
    expect(r.ok).toBe(false);
  });
});
