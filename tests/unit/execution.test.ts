import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, "../fixtures/exec");

describe("capability execution config", () => {
  it("passes execution.env through to the child process", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "echo-env")!;
    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {} });
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.stdout)).toEqual({ value: "hello-from-env" });
  });

  it("honors manifest execution.timeoutMs", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "slow")!;
    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {}, timeoutMs: 150 });
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/timeout/);
  });

  it("caller-supplied timeoutMs overrides manifest default", async () => {
    const caps = await loadRegistry(FIX);
    const cap = caps.find((c) => c.manifest.name === "echo-env")!;
    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {}, timeoutMs: 2000 });
    expect(r.ok).toBe(true);
  });
});
