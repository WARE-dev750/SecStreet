import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runCapability, evaluatePolicy } from "@secstreet/runtime";
import { DEFAULT_POLICY } from "@secstreet/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const OFFICIAL = resolve(here, "../../capabilities/official");
const FIX = resolve(here, "../fixtures/wrap");

describe("wrap-oss capability", () => {
  it("uname-info is registered at professional tier with subprocess", async () => {
    const caps = await loadRegistry(OFFICIAL);
    const cap = caps.find((c) => c.manifest.name === "uname-info");
    expect(cap).toBeDefined();
    expect(cap!.manifest.trust).toBe("professional");
    expect(cap!.manifest.permissions).toContain("subprocess");
  });

  it("professional tier permits subprocess in default policy", async () => {
    const caps = await loadRegistry(OFFICIAL);
    const cap = caps.find((c) => c.manifest.name === "uname-info")!;
    const d = evaluatePolicy(cap.manifest, DEFAULT_POLICY);
    expect(d.allowed).toBe(true);
    expect(d.disallowed).toEqual([]);
  });

  it("community-tier variant is denied by policy", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "community-uname-info")!;
    const d = evaluatePolicy(cap.manifest, DEFAULT_POLICY);
    expect(d.allowed).toBe(false);
    expect(d.disallowed).toContain("subprocess");
  });

  it("community-tier variant is refused at run time without spawning a process", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "community-uname-info")!;
    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {} });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.deniedByPolicy?.disallowed).toContain("subprocess");
  });

  it("uname-info wraps uname and returns parsed shape", async () => {
    const caps = await loadRegistry(OFFICIAL);
    const cap = caps.find((c) => c.manifest.name === "uname-info")!;
    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {} });
    expect(r.ok).toBe(true);
    const parsed = JSON.parse(r.stdout);
    expect(typeof parsed.sysname).toBe("string");
    expect(typeof parsed.release).toBe("string");
    expect(typeof parsed.machine).toBe("string");
    expect(typeof parsed.raw).toBe("string");
    expect(parsed.sysname.length).toBeGreaterThan(0);
  });
});
