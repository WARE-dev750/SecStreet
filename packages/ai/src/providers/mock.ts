import type { AIProvider, CompletionRequest, CompletionResult } from "./types.js";

export class MockProvider implements AIProvider {
  readonly name = "mock";

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const producerMatch = req.user.match(/PRODUCER_PATHS:\s*([^\n]*)/);
    const consumerMatch = req.user.match(/CONSUMER_REQUIRED:\s*([^\n]*)/);
    const producerPaths = (producerMatch?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const consumerRequired = (consumerMatch?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    const mappings: Array<{ target: string; source: string | null }> = [];
    for (const target of consumerRequired) {
      if (producerPaths.includes(target)) {
        mappings.push({ target, source: target });
        continue;
      }
      const suffixMatch = producerPaths.find((p) => p.split(".").pop() === target);
      if (suffixMatch) {
        mappings.push({ target, source: suffixMatch });
        continue;
      }
      mappings.push({ target, source: null });
    }

    const copied = mappings.filter((m) => m.source !== null).map((m) => m.source + "->" + m.target);
    const synthesized = mappings.filter((m) => m.source === null).map((m) => m.target);

    const lines: string[] = [];
    lines.push("#!/usr/bin/env node");
    lines.push("let raw = \"\";");
    lines.push("process.stdin.on(\"data\", (d) => (raw += d.toString()));");
    lines.push("process.stdin.on(\"end\", () => {");
    lines.push("  try {");
    lines.push("    const input = JSON.parse(raw || \"{}\");");
    lines.push("    const output = {};");
    for (const m of mappings) {
      if (m.source !== null) {
        lines.push("    setPath(output, " + JSON.stringify(m.target) + ", getPath(input, " + JSON.stringify(m.source) + "));");
      } else {
        lines.push("    if (getPath(input, " + JSON.stringify(m.target) + ") === undefined) {");
        lines.push("      setPath(output, " + JSON.stringify(m.target) + ", []);");
        lines.push("    } else {");
        lines.push("      setPath(output, " + JSON.stringify(m.target) + ", getPath(input, " + JSON.stringify(m.target) + "));");
        lines.push("    }");
      }
    }
    lines.push("    process.stdout.write(JSON.stringify(output));");
    lines.push("  } catch (err) {");
    lines.push("    process.stderr.write(String(err && err.message ? err.message : err));");
    lines.push("    process.exit(1);");
    lines.push("  }");
    lines.push("});");
    lines.push("");
    lines.push("function getPath(obj, path) {");
    lines.push("  const parts = String(path).split(\".\");");
    lines.push("  let cur = obj;");
    lines.push("  for (const p of parts) {");
    lines.push("    if (cur === null || typeof cur !== \"object\") return undefined;");
    lines.push("    cur = cur[p];");
    lines.push("  }");
    lines.push("  return cur;");
    lines.push("}");
    lines.push("");
    lines.push("function setPath(obj, path, value) {");
    lines.push("  const parts = String(path).split(\".\");");
    lines.push("  let cur = obj;");
    lines.push("  for (let i = 0; i < parts.length - 1; i++) {");
    lines.push("    const p = parts[i];");
    lines.push("    if (cur[p] === null || typeof cur[p] !== \"object\") cur[p] = {};");
    lines.push("    cur = cur[p];");
    lines.push("  }");
    lines.push("  cur[parts[parts.length - 1]] = value;");
    lines.push("}");
    lines.push("");
    const response = {
      files: {
        "index.js": lines.join("\n"),
        "input.schema.json": JSON.stringify({
          type: "object",
          properties: Object.fromEntries(producerPaths.map((f) => [f, {}])),
        }, null, 2),
        "output.schema.json": JSON.stringify({
          type: "object",
          required: consumerRequired,
          properties: Object.fromEntries(consumerRequired.map((f) => [f, {}])),
        }, null, 2),
      },
      rationale: "Copied " + (copied.join(", ") || "nothing") +
        "; synthesized " + (synthesized.join(", ") || "nothing") + ".",
    };
    return { text: JSON.stringify(response), model: "mock-3", provider: this.name };
  }
}
