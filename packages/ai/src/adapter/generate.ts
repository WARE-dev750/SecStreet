import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RegisteredCapability } from "@secstreet/capability";
import type { AIProvider } from "../providers/types.js";
import { buildAdapterPrompt } from "./prompt.js";

export interface GeneratedAdapter {
  adapterName: string;
  files: Record<string, string>;
  rationale: string;
  provider: string;
  model: string;
}

export interface GenerateAdapterOptions {
  producer: RegisteredCapability;
  consumer: RegisteredCapability;
  adapterName?: string;
  provider: AIProvider;
}

export async function generateAdapter(opts: GenerateAdapterOptions): Promise<GeneratedAdapter> {
  const adapterName = opts.adapterName ??
    ("adapt-" + opts.producer.manifest.name + "-to-" + opts.consumer.manifest.name);

  const producerOut = JSON.parse(
    await readFile(join(opts.producer.dir, opts.producer.manifest.outputSchema), "utf8")
  );
  const consumerIn = JSON.parse(
    await readFile(join(opts.consumer.dir, opts.consumer.manifest.inputSchema), "utf8")
  );

  const { system, user } = buildAdapterPrompt({
    producerName: opts.producer.manifest.name,
    producerOutputSchema: producerOut,
    consumerName: opts.consumer.manifest.name,
    consumerInputSchema: consumerIn,
    adapterName,
  });

  const result = await opts.provider.complete({ system, user });
  const parsed = parseGeneration(result.text);

  return {
    adapterName,
    files: parsed.files,
    rationale: parsed.rationale,
    provider: result.provider,
    model: result.model,
  };
}

interface ParsedGeneration {
  files: Record<string, string>;
  rationale: string;
}

export function parseGeneration(text: string): ParsedGeneration {
  let raw = text.trim();
  // tolerate code fences from less compliant models
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("provider did not return valid JSON: " + (err as Error).message);
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("provider response is not an object");
  const p = parsed as Record<string, unknown>;
  if (typeof p.files !== "object" || p.files === null) throw new Error("provider response missing files");
  const files = p.files as Record<string, unknown>;
  for (const key of Object.keys(files)) {
    if (typeof files[key] !== "string") throw new Error("file " + key + " is not a string");
  }
  if (!files["index.js"] || !files["input.schema.json"] || !files["output.schema.json"]) {
    throw new Error("provider must return index.js, input.schema.json, output.schema.json");
  }
  const rationale = typeof p.rationale === "string" ? p.rationale : "";
  return { files: files as Record<string, string>, rationale };
}
