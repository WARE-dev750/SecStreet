import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RegisteredCapability } from "@secstreet/capability";

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
}

/**
 * V0 compatibility: field-presence only.
 *
 * Checks that every field the consumer requires is present in the producer's
 * output schema. Does NOT verify types, nested structure, enums, or semantics.
 * Full JSON-Schema compatibility is a later milestone.
 */
export interface CompatibilityResult {
  ok: boolean;
  kind: "field-presence";
  missing: string[];
  reason?: string;
}

export async function checkCompatibility(
  producer: RegisteredCapability,
  consumer: RegisteredCapability
): Promise<CompatibilityResult> {
  const producerOut = JSON.parse(
    await readFile(join(producer.dir, producer.manifest.outputSchema), "utf8")
  ) as JsonSchema;
  const consumerIn = JSON.parse(
    await readFile(join(consumer.dir, consumer.manifest.inputSchema), "utf8")
  ) as JsonSchema;

  const required = consumerIn.required ?? [];
  const produced = Object.keys(producerOut.properties ?? {});
  const missing = required.filter((key) => !produced.includes(key));

  if (missing.length > 0) {
    return {
      ok: false,
      kind: "field-presence",
      missing,
      reason: `producer ${producer.manifest.name} does not expose required field(s): ${missing.join(", ")}`,
    };
  }
  return { ok: true, kind: "field-presence", missing: [] };
}
