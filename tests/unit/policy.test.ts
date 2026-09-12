import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runCapability, evaluatePolicy } from "@secstreet/runtime";
import { DEFAULT_POLICY } from "@secstreet/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, "../fixtures/policy");
const OFFICIAL = resolve(here, "../../capabilities/official");

describe("policy enforcement", () => {
  it("denies community-tier capabilities that declare network", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "community-network")!;
    const d = evaluatePolicy(cap.manifest, DEFAULT_POLICY);
    expect(d.allowed).toBe(false);
    expect(d.disallowed).toContain("network");
  });

  it("allows verified-tier capabilities to declare network", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "verified-network")!;
    const d = evaluatePolicy(cap.manifest, DEFAULT_POLICY);
    expect(d.allowed).toBe(true);
    expect(d.disallowed).toEqual([]);
  });

  it("refuses to execute a capability that exceeds its tier", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "community-network")!;
    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {} });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.deniedByPolicy?.disallowed).toContain("network");
  });

  it("runs a capability that fits its tier", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "verified-network")!;
    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {} });
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.stdout)).toEqual({ ok: true });
  });

  it("allows existing log-parsing capabilities at any tier (empty permissions)", async () => {
    const caps = await loadRegistry(OFFICIAL);
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    expect(evaluatePolicy(cap.manifest, DEFAULT_POLICY).allowed).toBe(true);
  });
});
