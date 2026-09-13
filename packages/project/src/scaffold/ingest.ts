import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  CapabilityTrust,
  CapabilityRisk,
  Permission,
} from "@secstreet/contracts";

export interface IngestOptions {
  root: string;
  name: string;
  tool: string;
  args: string[];
  inputMode: "file" | "text";
  samplePath: string;
  description?: string;
  trust?: CapabilityTrust;
  risk?: CapabilityRisk;
  permissions?: Permission[];
  timeoutMs?: number;
  maintainer?: string;
  author?: string;
  license?: string;
}

export interface IngestResult {
  dir: string;
  capturedBytes: number;
  capturedLines: number;
  tool: string;
  args: string[];
  samplePath: string;
}

function defaultTrust(permissions: Permission[]): CapabilityTrust {
  // A capability that declares any permission beyond the community tier's
  // empty set cannot be community-tier or the policy engine will refuse to
  // run it. Pick the lowest tier that permits everything declared.
  if (permissions.length === 0) return "community";
  const professional = new Set(["filesystem:read", "env:read", "subprocess"]);
  if (permissions.every((p) => professional.has(p))) return "professional";
  const verified = new Set(["filesystem:read", "filesystem:write", "env:read", "network", "subprocess"]);
  if (permissions.every((p) => verified.has(p))) return "verified";
  return "restricted";
}

function buildEntrypoint(opts: IngestOptions): string {
  const isFile = opts.inputMode === "file";
  const argsLiteral = JSON.stringify([...opts.args, "__INPUT__"]);
  const placeholder = isFile ? 'input.path' : 'input.text';
  return [
    "#!/usr/bin/env node",
    'import { spawnSync } from "node:child_process";',
    'import { readFileSync } from "node:fs";',
    "",
    "// Auto-scaffolded by `secstreet ingest`. The tool call is wired; the",
    "// parseOutput function below is the piece you need to implement.",
    "// The captured sample at scaffold time was written to sample.stdout,",
    "// and the test file asserts against the shape you choose here.",
    "",
    "function parseOutput(stdout, input) {",
    "  void input;",
    "  // TODO: parse `stdout` into a structured JSON object.",
    "  // Return { raw: stdout } until you replace this. The registry will",
    "  // still accept the capability, but downstream consumers will see",
    "  // only a raw string until you produce named fields.",
    "  return { raw: stdout };",
    "}",
    "",
    "function runTool(input) {",
    isFile
      ? "  const path = input.path;"
      : "  const path = null;",
    isFile
      ? '  if (typeof path !== "string" || !path) throw new Error("input.path must be a non-empty string");'
      : '  const text = input.text;',
    isFile
      ? '  if (path.startsWith("-")) throw new Error("input.path must not start with \'-\'");'
      : '  if (typeof text !== "string") throw new Error("input.text must be a string");',
    "",
    "  const args = " + argsLiteral + ";",
    isFile
      ? '  const finalArgs = args.map((a) => (a === "__INPUT__" ? path : a));'
      : '  const finalArgs = args.filter((a) => a !== "__INPUT__");',
    "",
    "  const r = spawnSync(" + JSON.stringify(opts.tool) + ", finalArgs, {",
    "    encoding: \"utf8\",",
    isFile ? "    input: undefined," : "    input: text,",
    "    timeout: " + (opts.timeoutMs ?? 5000),
    "  });",
    '  if (r.error) throw new Error(' + JSON.stringify(opts.tool + " failed: ") + ' + r.error.message);',
    "  if (r.status !== 0) {",
    '    const err = String(r.stderr || "").trim();',
    '    throw new Error(' + JSON.stringify(opts.tool + " exit ") + ' + r.status + (err ? ": " + err : ""));',
    "  }",
    "  return r.stdout;",
    "}",
    "",
    "function main() {",
    '  let raw = "";',
    '  process.stdin.on("data", (d) => (raw += d.toString()));',
    '  process.stdin.on("end", () => {',
    "    try {",
    '      const input = JSON.parse(raw || "{}");',
    "      const stdout = runTool(input);",
    "      const out = parseOutput(stdout, input);",
    "      process.stdout.write(JSON.stringify(out));",
    "    } catch (err) {",
    "      process.stderr.write(String(err && err.message ? err.message : err));",
    "      process.exit(1);",
    "    }",
    "  });",
    "}",
    "main();",
    "",
  ].join("\n");
}

function buildInputSchema(opts: IngestOptions): object {
  if (opts.inputMode === "file") {
    return {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string", minLength: 1 } },
    };
  }
  return {
    type: "object",
    required: ["text"],
    properties: { text: { type: "string" } },
  };
}

function buildOutputSchema(opts: IngestOptions): object {
  // Generic shape until the human replaces parseOutput. Declared as an
  // object so it validates cleanly; the `raw` field is always present.
  return {
    type: "object",
    required: ["raw"],
    properties: {
      raw: { type: "string" },
    },
  };
}

function buildTest(opts: IngestOptions, captured: string): string {
  const isFile = opts.inputMode === "file";
  const inputLiteral = isFile ? '{ path: samplePath }' : '{ text: "FIXME" }';
  return [
    'import { describe, it, expect } from "vitest";',
    'import { fileURLToPath } from "node:url";',
    'import { dirname, resolve } from "node:path";',
    'import { loadRegistry } from "@secstreet/capability";',
    'import { runCapability } from "@secstreet/runtime";',
    "",
    "const here = dirname(fileURLToPath(import.meta.url));",
    'const OFFICIAL = resolve(here, "../../capabilities/official");',
    "",
    "// The sample file that was used at scaffold time:",
    "//   " + opts.samplePath,
    "// Captured output was " + captured.length + " bytes.",
    "",
    "async function run() {",
    "  const caps = await loadRegistry(OFFICIAL);",
    '  const cap = caps.find((c) => c.manifest.name === ' + JSON.stringify(opts.name) + ");",
    '  if (!cap) throw new Error("missing capability: " + ' + JSON.stringify(opts.name) + ");",
    '  const samplePath = ' + JSON.stringify(opts.samplePath) + ";",
    "  return runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: " + inputLiteral + " });",
    "}",
    "",
    'describe(' + JSON.stringify(opts.name) + ", () => {",
    '  it("runs against the captured sample", async () => {',
    "    const r = await run();",
    "    expect(r.ok).toBe(true);",
    '    const out = JSON.parse(r.stdout);',
    "    // TODO: replace this assertion once parseOutput returns structured fields.",
    '    expect(typeof out.raw).toBe("string");',
    "    expect(out.raw.length).toBeGreaterThan(0);",
    "  });",
    "",
    '  it("rejects malformed input", async () => {',
    "    const caps = await loadRegistry(OFFICIAL);",
    '    const cap = caps.find((c) => c.manifest.name === ' + JSON.stringify(opts.name) + ")!;",
    '    const r = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input: {} });',
    "    expect(r.ok).toBe(false);",
    "  });",
    "});",
    "",
  ].join("\n");
}

export async function ingestTool(opts: IngestOptions): Promise<IngestResult> {
  const dir = join(opts.root, opts.name);
  if (existsSync(dir)) throw new Error("already exists: " + dir);

  // 1. Run the tool against the sample to capture real output.
  const args = opts.args.map((a) => (a === "__INPUT__" ? opts.samplePath : a));
  const finalArgs = opts.inputMode === "file" ? args : opts.args.filter((a) => a !== "__INPUT__");
  let stdin = undefined as string | undefined;
  if (opts.inputMode === "text") {
    stdin = await readFile(opts.samplePath, "utf8");
  }
  const run = spawnSync(opts.tool, finalArgs, {
    encoding: "utf8",
    input: stdin,
    timeout: opts.timeoutMs ?? 5000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) throw new Error(opts.tool + " failed to run: " + run.error.message);
  if (run.status !== 0) {
    const err = String(run.stderr || "").trim();
    throw new Error(opts.tool + " exit " + run.status + (err ? ": " + err : ""));
  }
  const captured = run.stdout;
  const capturedLines = captured.split(/\r?\n/).length;

  // 2. Write the capability directory.
  await mkdir(dir, { recursive: true });

  const manifest = {
    name: opts.name,
    version: "0.1.0",
    description: opts.description ?? ("Wraps " + opts.tool + " on " + (opts.inputMode === "file" ? "a file path" : "stdin text") + "."),
    language: "javascript",
    entrypoint: "index.js",
    inputSchema: "input.schema.json",
    outputSchema: "output.schema.json",
    dependencies: [],
    os: ["linux", "darwin"],
    permissions: opts.permissions ?? ["subprocess"],
    risk: opts.risk ?? "low",
    trust: opts.trust ?? defaultTrust(opts.permissions ?? ["subprocess"]),
    provenance: {
      sourceRepo: "https://github.com/SecStreet/SecStreet",
      sourceAuthor: opts.author ?? "SecStreet",
      license: opts.license ?? "Proprietary",
      version: "0.1.0",
      modifications: ["wraps system " + opts.tool + " binary; parseOutput implemented in SecStreet"],
    },
    maintainer: opts.maintainer ?? "SecStreet",
    execution: { timeoutMs: opts.timeoutMs ?? 5000 },
  };

  await writeFile(join(dir, "capability.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(dir, "input.schema.json"), JSON.stringify(buildInputSchema(opts), null, 2) + "\n");
  await writeFile(join(dir, "output.schema.json"), JSON.stringify(buildOutputSchema(opts), null, 2) + "\n");
  await writeFile(join(dir, "index.js"), buildEntrypoint(opts));
  await writeFile(join(dir, "sample.stdout"), captured);
  await writeFile(join(dir, "package.json"), JSON.stringify({
    name: opts.name + "-capability",
    private: true,
    type: "module",
  }, null, 2) + "\n");

  // 3. Write the test.
  const testsDir = join(opts.root, "..", "..", "tests", "unit");
  const testPath = join(testsDir, opts.name + ".test.ts");
  if (!existsSync(testPath)) {
    await writeFile(testPath, buildTest(opts, captured));
  }

  return {
    dir,
    capturedBytes: captured.length,
    capturedLines,
    tool: opts.tool,
    args: finalArgs,
    samplePath: opts.samplePath,
  };
}
