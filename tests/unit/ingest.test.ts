import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ingestTool } from "@secstreet/project";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";

describe("ingestTool", () => {
  let tmp: string;
  let capRoot: string;
  let sample: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "secstreet-ingest-"));
    capRoot = join(tmp, "capabilities", "official");
    await mkdir(capRoot, { recursive: true });
    await mkdir(join(tmp, "tests", "unit"), { recursive: true });
    sample = join(tmp, "sample.txt");
    await writeFile(sample, "line one\nline two\nline three\n");
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("scaffolds a capability directory with all required files", async () => {
    const r = await ingestTool({
      root: capRoot,
      name: "cat-lines",
      tool: "cat",
      args: ["__INPUT__"],
      inputMode: "file",
      samplePath: sample,
      description: "cat a file",
    });
    expect(r.capturedBytes).toBeGreaterThan(0);
    const files = [
      "capability.json",
      "input.schema.json",
      "output.schema.json",
      "index.js",
      "sample.stdout",
      "package.json",
    ];
    for (const f of files) {
      const content = await readFile(join(r.dir, f), "utf8");
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it("captures the real tool output into sample.stdout", async () => {
    const r = await ingestTool({
      root: capRoot,
      name: "cat-lines",
      tool: "cat",
      args: ["__INPUT__"],
      inputMode: "file",
      samplePath: sample,
    });
    const captured = await readFile(join(r.dir, "sample.stdout"), "utf8");
    expect(captured).toBe("line one\nline two\nline three\n");
  });

  it("produces a manifest the registry accepts", async () => {
    await ingestTool({
      root: capRoot,
      name: "cat-lines",
      tool: "cat",
      args: ["__INPUT__"],
      inputMode: "file",
      samplePath: sample,
      trust: "professional",
      permissions: ["subprocess", "filesystem:read"],
    });
    const caps = await loadRegistry(capRoot);
    expect(caps).toHaveLength(1);
    expect(caps[0].manifest.name).toBe("cat-lines");
    expect(caps[0].manifest.trust).toBe("professional");
    expect(caps[0].manifest.permissions).toContain("filesystem:read");
  });

  it("the scaffolded capability runs and returns { raw } until parseOutput is implemented", async () => {
    const r = await ingestTool({
      root: capRoot,
      name: "cat-lines",
      tool: "cat",
      args: ["__INPUT__"],
      inputMode: "file",
      samplePath: sample,
      permissions: ["subprocess", "filesystem:read"],
    });
    const cap = { dir: r.dir, manifest: JSON.parse(await readFile(join(r.dir, "capability.json"), "utf8")) };
    const result = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: { path: sample } });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed.raw).toBe("string");
    expect(parsed.raw).toContain("line one");
  });

  it("refuses to overwrite an existing capability directory", async () => {
    await ingestTool({
      root: capRoot,
      name: "cat-lines",
      tool: "cat",
      args: ["__INPUT__"],
      inputMode: "file",
      samplePath: sample,
    });
    await expect(ingestTool({
      root: capRoot,
      name: "cat-lines",
      tool: "cat",
      args: ["__INPUT__"],
      inputMode: "file",
      samplePath: sample,
    })).rejects.toThrow(/already exists/);
  });

  it("propagates tool failure with a clear error", async () => {
    await expect(ingestTool({
      root: capRoot,
      name: "nonexistent-tool",
      tool: "definitely-not-a-real-binary-xyz",
      args: [],
      inputMode: "file",
      samplePath: sample,
    })).rejects.toThrow(/failed to run/);
  });
});
