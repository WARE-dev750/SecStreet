import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadRegistry } from "@secstreet/capability";
import { startRegistryServer, RegistryClient } from "@secstreet/service-registry";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../capabilities/official");

describe("registry service", () => {
  let handle: Awaited<ReturnType<typeof startRegistryServer>>;
  let client: RegistryClient;
  let tmp: string;

  beforeEach(async () => {
    handle = await startRegistryServer({ libraryDir: LIB, port: 0 });
    client = new RegistryClient(handle.url);
    tmp = await mkdtemp(join(tmpdir(), "secstreet-reg-"));
  });

  afterEach(async () => {
    await handle.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it("answers health", async () => {
    const h = await client.health();
    expect(h.ok).toBe(true);
  });

  it("lists every capability in the library", async () => {
    const caps = await client.list();
    const names = caps.map((c) => c.name);
    expect(names).toContain("parse-auth-log");
    expect(names).toContain("uname-info");
    expect(names).toContain("hash-file");
    expect(caps.length).toBeGreaterThanOrEqual(10);
  });

  it("serves a signed index with entries", async () => {
    const idx = await client.index();
    expect(idx.capabilities.length).toBeGreaterThanOrEqual(10);
    for (const c of idx.capabilities) {
      expect(c.integrity).toMatch(/^sha256-/);
    }
  });

  it("serves a full manifest for one capability", async () => {
    const m = await client.manifest("parse-auth-log");
    expect(m.name).toBe("parse-auth-log");
    expect(m.entrypoint).toBe("index.js");
  });

  it("returns 404 for an unknown capability", async () => {
    await expect(client.manifest("does-not-exist")).rejects.toThrow(/not found/);
  });

  it("downloads a capability to disk and it loads cleanly", async () => {
    await client.downloadTo("parse-auth-log", tmp);
    const loaded = await loadRegistry(tmp);
    expect(loaded.map((c) => c.manifest.name)).toContain("parse-auth-log");
    expect(loaded[0].manifest.description).toBeTruthy();
  });

  it("downloaded capability runs", async () => {
    await client.downloadTo("parse-auth-log", tmp);
    const loaded = await loadRegistry(tmp);
    const cap = loaded.find((c) => c.manifest.name === "parse-auth-log")!;
    const { runCapability } = await import("@secstreet/runtime");
    const r = await runCapability({
      capabilityDir: cap.dir,
      manifest: cap.manifest,
      input: { text: "Jan 10 12:00:01 host sshd[1]: Failed password for bob from 10.0.0.2 port 22 ssh2" },
    });
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.stdout).events).toHaveLength(1);
  });
});
