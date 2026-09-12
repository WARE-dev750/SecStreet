export interface AdapterPromptInput {
  producerName: string;
  producerOutputSchema: unknown;
  consumerName: string;
  consumerInputSchema: unknown;
  adapterName: string;
}

export function buildAdapterPrompt(input: AdapterPromptInput): { system: string; user: string } {
  const producerPaths = collectPaths(input.producerOutputSchema);
  const consumerRequired = collectRequiredPaths(input.consumerInputSchema);

  const system = [
    "You generate SecStreet adapter capabilities.",
    "A SecStreet adapter reads JSON on stdin and writes JSON on stdout.",
    "It transforms the producer's output shape into the consumer's input shape.",
    "Fields may be nested. Dotted paths like 'data.events' mean the value at",
    "input.data.events. If the producer already provides a path, pass it through",
    "unchanged. Only synthesize values for paths the producer does not provide.",
    "Respond with a single JSON object of this exact shape:",
    "{ \"files\": { \"index.js\": string, \"input.schema.json\": string, \"output.schema.json\": string }, \"rationale\": string }",
    "No markdown, no prose, no code fences. JSON only.",
  ].join(" ");

  const user = [
    "Write an adapter capability named " + input.adapterName + ".",
    "Producer: " + input.producerName,
    "Consumer: " + input.consumerName,
    "",
    "PRODUCER_PATHS: " + producerPaths.join(","),
    "CONSUMER_REQUIRED: " + consumerRequired.join(","),
    "",
    "Producer output schema:",
    JSON.stringify(input.producerOutputSchema, null, 2),
    "",
    "Consumer input schema:",
    JSON.stringify(input.consumerInputSchema, null, 2),
    "",
    "The adapter must produce every path in CONSUMER_REQUIRED.",
    "For any path in CONSUMER_REQUIRED also in PRODUCER_PATHS, copy it through.",
    "For any path not in PRODUCER_PATHS, synthesize an empty value of the right shape.",
  ].join("\n");

  return { system, user };
}

function collectPaths(schema: unknown, prefix = "", depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof schema !== "object" || schema === null) return [];
  const s = schema as Record<string, unknown>;
  const props = s.properties;
  if (typeof props !== "object" || props === null) return [];
  const out: string[] = [];
  for (const key of Object.keys(props as Record<string, unknown>)) {
    const path = prefix ? prefix + "." + key : key;
    out.push(path);
    const child = (props as Record<string, unknown>)[key];
    if (typeof child === "object" && child !== null) {
      const cs = child as Record<string, unknown>;
      if (cs.type === "object" || typeof cs.properties === "object") {
        out.push(...collectPaths(child, path, depth + 1));
      }
    }
  }
  return out;
}

function collectRequiredPaths(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  const s = schema as Record<string, unknown>;
  const req = s.required;
  if (Array.isArray(req)) {
    return req.filter((r): r is string => typeof r === "string");
  }
  return collectPaths(schema);
}
