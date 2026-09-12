import type { AIProvider, CompletionRequest, CompletionResult } from "./types.js";

// Deterministic provider for tests and offline use. It inspects the user
// prompt for two markers the adapter prompt places in every request:
//   PRODUCER_FIELDS: a,b,c
//   CONSUMER_REQUIRED: x,y
// and emits an adapter that reshapes one into the other.
export class MockProvider implements AIProvider {
  readonly name = "mock";

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const producerMatch = req.user.match(/PRODUCER_FIELDS:\s*([^\n]*)/);
    const consumerMatch = req.user.match(/CONSUMER_REQUIRED:\s*([^\n]*)/);
    const producerFields = (producerMatch?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const consumerRequired = (consumerMatch?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    // Build the adapter body. If the consumer needs a field the producer
    // does not emit, we pass it through as an empty value of the right shape.
    // This is a demonstration; a real LLM would reason about types.
    const body = [
      "#!/usr/bin/env node",
      "let raw = \"\";",
      "process.stdin.on(\"data\", (d) => (raw += d.toString()));",
      "process.stdin.on(\"end\", () => {",
      "  try {",
      "    const input = JSON.parse(raw || \"{}\");",
      "    const output = {};",
      ...consumerRequired.map((f) =>
        producerFields.includes(f)
          ? "    output[" + JSON.stringify(f) + "] = input[" + JSON.stringify(f) + "];"
          : "    output[" + JSON.stringify(f) + "] = Array.isArray(input[" + JSON.stringify(f) + "]) ? input[" + JSON.stringify(f) + "] : [];"
      ),
      "    process.stdout.write(JSON.stringify(output));",
      "  } catch (err) {",
      "    process.stderr.write(String(err && err.message ? err.message : err));",
      "    process.exit(1);",
      "  }",
      "});",
      "",
    ].join("\n");

    const response = {
      files: {
        "index.js": body,
        "input.schema.json": JSON.stringify({
          type: "object",
          required: producerFields,
          properties: Object.fromEntries(producerFields.map((f) => [f, {}])),
        }, null, 2),
        "output.schema.json": JSON.stringify({
          type: "object",
          required: consumerRequired,
          properties: Object.fromEntries(consumerRequired.map((f) => [f, {}])),
        }, null, 2),
      },
      rationale: "Copied " + producerFields.filter((f) => consumerRequired.includes(f)).join(", ") +
        "; filled " + consumerRequired.filter((f) => !producerFields.includes(f)).join(", ") + " with empty arrays.",
    };
    return { text: JSON.stringify(response), model: "mock-1", provider: this.name };
  }
}
