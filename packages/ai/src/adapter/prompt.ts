export interface AdapterPromptInput {
  producerName: string;
  producerOutputSchema: unknown;
  consumerName: string;
  consumerInputSchema: unknown;
  adapterName: string;
}

export function buildAdapterPrompt(input: AdapterPromptInput): { system: string; user: string } {
  const producerFields = collectFieldNames(input.producerOutputSchema);
  const consumerRequired = collectRequiredFields(input.consumerInputSchema);

  const system = [
    "You generate SecStreet adapter capabilities.",
    "A SecStreet adapter reads JSON on stdin and writes JSON on stdout.",
    "It transforms the producer's output shape into the consumer's input shape.",
    "Respond with a single JSON object of this exact shape:",
    "{ \"files\": { \"index.js\": string, \"input.schema.json\": string, \"output.schema.json\": string }, \"rationale\": string }",
    "No markdown, no prose, no code fences. JSON only.",
  ].join(" ");

  const user = [
    "Write an adapter capability named " + input.adapterName + ".",
    "Producer: " + input.producerName,
    "Consumer: " + input.consumerName,
    "",
    "PRODUCER_FIELDS: " + producerFields.join(","),
    "CONSUMER_REQUIRED: " + consumerRequired.join(","),
    "",
    "Producer output schema:",
    JSON.stringify(input.producerOutputSchema, null, 2),
    "",
    "Consumer input schema:",
    JSON.stringify(input.consumerInputSchema, null, 2),
    "",
    "The adapter must produce every field in CONSUMER_REQUIRED.",
  ].join("\n");

  return { system, user };
}

function collectFieldNames(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  const s = schema as Record<string, unknown>;
  const props = s.properties;
  if (typeof props !== "object" || props === null) return [];
  return Object.keys(props as Record<string, unknown>);
}

function collectRequiredFields(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  const s = schema as Record<string, unknown>;
  const req = s.required;
  if (Array.isArray(req)) return req.filter((r): r is string => typeof r === "string");
  return collectFieldNames(schema);
}
