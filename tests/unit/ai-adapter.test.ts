import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";
import { checkCompatibility } from "@secstreet/workflow";
import { MockProvider, generateAdapter, parseGeneration, scaffoldAdapter } from "@secstreet/ai";

const here = dirname(fileURLToPath(import.meta.url));
const ADAPT_FIX = resolve(here, "../fixtures/adapters");

describe("ai adapter generation", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-ai-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("parseGeneration tolerates code fences", () => {
    const body = JSON.stringify({
      files: { "index.js": "x", "input.schema.json": "{}", "output.schema.json": "{}" },
      rationale: "because",
    });
    const fenced = "```json\n" + body + "\n```";
    const out = parseGeneration(fenced);
    expect(out.files["index.js"]).toBe("x");
  });

  it("parseGeneration rejects missing files", () => {
    expect(() => parseGeneration(JSON.stringify({ files: {}, rationale: "" })))
      .toThrow(/must return/);
  });

  it("mock provider produces a runnable adapter that bridges producer to consumer", async () => {
    const caps = await loadRegistry(ADAPT_FIX);
    const producer = caps.find((c) => c.manifest.name === "emit-wrapped")!;
    const consumer = caps.find((c) => c.manifest.name === "consume-events")!;

    const generated = await generateAdapter({
      producer, consumer,
      adapterName: "generated-unwrap",
      provider: new MockProvider(),
    });
    expect(generated.provider).toBe("mock");
    expect(generated.files["index.js"]).toContain("process.stdin");

    const { dir } = await scaffoldAdapter({
      root: tmp, generated,
      producerName: producer.manifest.name,
      consumerName: consumer.manifest.name,
    });

    // The generated adapter must be a valid capability
    const reg = await loadRegistry(tmp);
    expect(reg.map((c) => c.manifest.name)).toContain("generated-unwrap");
    expect(reg[0].manifest.kind).toBe("adapter");

    // It must bridge the shapes
    const adapterCap = reg[0];
    expect((await checkCompatibility(producer, adapterCap)).ok).toBe(true);
    expect((await checkCompatibility(adapterCap, consumer)).ok).toBe(true);

    // And it must run correctly
    const input = { data: { events: [{ id: 1 }, { id: 2 }] } };
    const r = await runCapability({
      capabilityDir: adapterCap.dir,
      manifest: adapterCap.manifest,
      input,
    });
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.stdout);
    expect(Array.isArray(out.events)).toBe(true);
  });
});
