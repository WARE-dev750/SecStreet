import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";
import { checkCompatibility } from "@secstreet/workflow";
import { MockProvider, generateAdapter, scaffoldAdapter, buildAdapterPrompt } from "@secstreet/ai";

const here = dirname(fileURLToPath(import.meta.url));
const ADAPT_FIX = resolve(here, "../fixtures/adapters");

describe("ai adapter generation with nested paths", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-ain-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("prompt collects nested producer paths", () => {
    const { user } = buildAdapterPrompt({
      producerName: "p", consumerName: "c", adapterName: "a",
      producerOutputSchema: {
        type: "object",
        properties: { data: { type: "object", properties: { events: { type: "array" } } } },
      },
      consumerInputSchema: {
        type: "object", required: ["events"],
        properties: { events: { type: "array" } },
      },
    });
    expect(user).toContain("data.events");
  });

  it("mock provider maps events from data.events by suffix match", async () => {
    const caps = await loadRegistry(ADAPT_FIX);
    const producer = caps.find((c) => c.manifest.name === "emit-wrapped")!;
    const consumer = caps.find((c) => c.manifest.name === "consume-events")!;

    const generated = await generateAdapter({
      producer, consumer,
      adapterName: "gen-nested",
      provider: new MockProvider(),
    });
    expect(generated.files["index.js"]).toContain("data.events");

    const { dir } = await scaffoldAdapter({
      root: tmp, generated,
      producerName: producer.manifest.name,
      consumerName: consumer.manifest.name,
    });
    void dir;

    const reg = await loadRegistry(tmp);
    const adapterCap = reg.find((c) => c.manifest.name === "gen-nested")!;
    expect((await checkCompatibility(producer, adapterCap)).ok).toBe(true);
    expect((await checkCompatibility(adapterCap, consumer)).ok).toBe(true);

    const input = { data: { events: [{ id: 1 }, { id: 2 }, { id: 3 }] } };
    const r = await runCapability({
      capabilityDir: adapterCap.dir,
      manifest: adapterCap.manifest,
      input,
    });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(out.events).toHaveLength(3);
    expect(out.events[0]).toEqual({ id: 1 });
    expect(out.events[2]).toEqual({ id: 3 });
  });

  it("rationale reports the suffix mapping and empty synthesis set", async () => {
    const caps = await loadRegistry(ADAPT_FIX);
    const producer = caps.find((c) => c.manifest.name === "emit-wrapped")!;
    const consumer = caps.find((c) => c.manifest.name === "consume-events")!;
    const generated = await generateAdapter({
      producer, consumer, adapterName: "gen-rationale", provider: new MockProvider(),
    });
    expect(generated.rationale).toContain("data.events->events");
    expect(generated.rationale).toContain("synthesized nothing");
  });

  it("synthesizes empty arrays when no producer field matches", async () => {
    const caps = await loadRegistry(ADAPT_FIX);
    const producer = caps.find((c) => c.manifest.name === "consume-events")!; // outputs {count}
    const consumer = caps.find((c) => c.manifest.name === "consume-events")!; // needs {events}
    const generated = await generateAdapter({
      producer, consumer, adapterName: "gen-synth", provider: new MockProvider(),
    });
    expect(generated.rationale).toMatch(/synthesized events/);
    expect(generated.files["index.js"]).toContain("setPath(output, \"events\", [])");
  });
});
