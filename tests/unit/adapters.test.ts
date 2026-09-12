import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runWorkflow, checkCompatibility } from "@secstreet/workflow";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, "../fixtures/adapters");

async function writeWorkflow(name: string, steps: unknown, autoAdapters?: boolean): Promise<string> {
  const fs = await import("node:fs/promises");
  const path = resolve(here, "../fixtures/adapters/" + name);
  await fs.writeFile(path, JSON.stringify({ name, steps, autoAdapters }, null, 2));
  return path;
}

describe("adapter insertion", () => {
  it("producer → consumer are incompatible without an adapter", async () => {
    const caps = await loadRegistry(FIX);
    const producer = caps.find((c) => c.manifest.name === "emit-wrapped")!;
    const consumer = caps.find((c) => c.manifest.name === "consume-events")!;
    const r = await checkCompatibility(producer, consumer);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("events");
  });

  it("adapter bridges producer and consumer", async () => {
    const caps = await loadRegistry(FIX);
    const producer = caps.find((c) => c.manifest.name === "emit-wrapped")!;
    const adapter = caps.find((c) => c.manifest.name === "unwrap-data-events")!;
    const consumer = caps.find((c) => c.manifest.name === "consume-events")!;
    expect((await checkCompatibility(producer, adapter)).ok).toBe(true);
    expect((await checkCompatibility(adapter, consumer)).ok).toBe(true);
  });

  it("workflow runner inserts the adapter automatically", async () => {
    const wf = await writeWorkflow("auto-insert.json", [
      { id: "emit", capability: "emit-wrapped", input: {} },
      { id: "consume", capability: "consume-events", from: "emit" },
    ]);
    const r = await runWorkflow({ workflowPath: wf, capabilitiesDir: FIX });
    expect(r.ok).toBe(true);
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0].capability).toBe("emit-wrapped");
    expect(r.steps[1].capability).toBe("unwrap-data-events");
    expect(r.steps[1].insertedAdapter).toBe(true);
    expect(r.steps[2].capability).toBe("consume-events");
    expect(r.output).toEqual({ count: 3 });
  });

  it("workflow with autoAdapters=false fails instead of inserting", async () => {
    const wf = await writeWorkflow("no-auto.json", [
      { id: "emit", capability: "emit-wrapped", input: {} },
      { id: "consume", capability: "consume-events", from: "emit" },
    ], false);
    const r = await runWorkflow({ workflowPath: wf, capabilitiesDir: FIX });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/incompatible/);
    expect(r.steps).toHaveLength(1);
  });
});
