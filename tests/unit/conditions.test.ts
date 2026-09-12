import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runWorkflow } from "@secstreet/workflow";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, "../fixtures/conditional");

describe("workflow conditions", () => {
  it("runs only the matching branch", async () => {
    const r = await runWorkflow({ workflowPath: resolve(FIX, "then-a.json"), capabilitiesDir: FIX });
    expect(r.ok).toBe(true);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0].skipped).toBeUndefined();
    expect(r.steps[1].skipped).toBeUndefined();
    expect(r.steps[1].output).toEqual({ branch: "a", value: 10 });
    expect(r.steps[2].skipped).toBe(true);
    expect(r.steps[2].output).toBeUndefined();
  });

  it("cascades skip to steps that reference a skipped step", async () => {
    const r = await runWorkflow({ workflowPath: resolve(FIX, "cascade.json"), capabilitiesDir: FIX });
    expect(r.ok).toBe(true);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[1].skipped).toBe(true);
    expect(r.steps[2].skipped).toBe(true);
  });

  it("reports an error when a condition references an unknown step", async () => {
    const fs = await import("node:fs/promises");
    const bad = resolve(FIX, "bad-ref.json");
    await fs.writeFile(bad, JSON.stringify({
      name: "bad-ref",
      steps: [
        { id: "a", capability: "emit-a", input: {} },
        { id: "b", capability: "emit-b", input: {}, when: { step: "missing", path: "x", op: "equals", value: 1 } }
      ]
    }));
    const r = await runWorkflow({ workflowPath: bad, capabilitiesDir: FIX });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/references unknown or skipped step/);
  });
});
