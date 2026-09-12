import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRegistry, type RegisteredCapability } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";
import { checkCompatibility } from "./compatibility.js";
import type { Workflow, WorkflowResult, StepResult } from "./types.js";

export interface RunWorkflowOptions {
  workflowPath: string;
  capabilitiesDir: string;
}

async function findAdapter(
  registry: RegisteredCapability[],
  producer: RegisteredCapability,
  consumer: RegisteredCapability
): Promise<RegisteredCapability | null> {
  for (const candidate of registry) {
    if (candidate.manifest.kind !== "adapter") continue;
    const a = await checkCompatibility(producer, candidate);
    if (!a.ok) continue;
    const b = await checkCompatibility(candidate, consumer);
    if (!b.ok) continue;
    return candidate;
  }
  return null;
}

export async function runWorkflow(opts: RunWorkflowOptions): Promise<WorkflowResult> {
  const workflowPath = resolve(opts.workflowPath);
  const raw = await readFile(workflowPath, "utf8");
  const workflow = JSON.parse(raw) as Workflow;
  const autoAdapters = workflow.autoAdapters !== false;

  if (!workflow.name) throw new Error("workflow.name is required");
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    throw new Error("workflow.steps must be a non-empty array");
  }

  const registry = await loadRegistry(opts.capabilitiesDir);
  const byName = new Map(registry.map((c) => [c.manifest.name, c]));

  const outputs = new Map<string, unknown>();
  const producers = new Map<string, RegisteredCapability>();
  const steps: StepResult[] = [];
  let lastOutput: unknown;

  for (const step of workflow.steps) {
    if (!step.id || !step.capability) {
      return { name: workflow.name, ok: false, steps, error: "each step requires id and capability" };
    }
    if (outputs.has(step.id)) {
      return { name: workflow.name, ok: false, steps, error: "duplicate step id: " + step.id };
    }
    const cap = byName.get(step.capability);
    if (!cap) {
      return { name: workflow.name, ok: false, steps, error: "capability not found: " + step.capability };
    }

    let input: unknown;
    if (step.from) {
      if (!outputs.has(step.from)) {
        return { name: workflow.name, ok: false, steps, error: "step " + step.id + " references unknown step: " + step.from };
      }
      const producerCap = producers.get(step.from);
      if (!producerCap) {
        return { name: workflow.name, ok: false, steps, error: "no producer recorded for: " + step.from };
      }
      const compat = await checkCompatibility(producerCap, cap);
      if (compat.ok) {
        input = outputs.get(step.from);
      } else if (!autoAdapters) {
        return { name: workflow.name, ok: false, steps, error: "incompatible: " + compat.reason };
      } else {
        const adapter = await findAdapter(registry, producerCap, cap);
        if (!adapter) {
          return {
            name: workflow.name,
            ok: false,
            steps,
            error: "no adapter found from " + producerCap.manifest.name + " to " + cap.manifest.name + ": " + compat.reason,
          };
        }
        const adapterInput = outputs.get(step.from);
        const adapterResult = await runCapability({
          capabilityDir: adapter.dir,
          manifest: adapter.manifest,
          input: adapterInput,
        });
        const adapterStep: StepResult = {
          id: step.id + "::adapter",
          capability: adapter.manifest.name,
          ok: adapterResult.ok,
          durationMs: adapterResult.durationMs,
          insertedAdapter: true,
        };
        if (!adapterResult.ok) {
          adapterStep.error = adapterResult.deniedByPolicy
            ? "policy denied: " + adapterResult.deniedByPolicy.reason
            : (adapterResult.stderr || "exit code " + adapterResult.exitCode);
          steps.push(adapterStep);
          return { name: workflow.name, ok: false, steps, error: adapterStep.error };
        }
        const adapterOutput = adapterResult.stdout.trim() ? JSON.parse(adapterResult.stdout) : undefined;
        adapterStep.output = adapterOutput;
        steps.push(adapterStep);
        outputs.set(adapterStep.id, adapterOutput);
        producers.set(adapterStep.id, adapter);
        input = adapterOutput;
      }
    } else if (step.input !== undefined) {
      input = step.input;
    } else {
      return { name: workflow.name, ok: false, steps, error: "step " + step.id + " needs input or from" };
    }

    const result = await runCapability({
      capabilityDir: cap.dir,
      manifest: cap.manifest,
      input,
      timeoutMs: step.timeoutMs,
    });

    const stepResult: StepResult = {
      id: step.id,
      capability: step.capability,
      ok: result.ok,
      durationMs: result.durationMs,
    };

    if (!result.ok) {
      stepResult.error = result.deniedByPolicy
        ? "policy denied: " + result.deniedByPolicy.reason
        : (result.stderr || "exit code " + result.exitCode);
      steps.push(stepResult);
      return { name: workflow.name, ok: false, steps, error: stepResult.error };
    }

    const parsed = result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
    stepResult.output = parsed;
    steps.push(stepResult);
    outputs.set(step.id, parsed);
    producers.set(step.id, cap);
    lastOutput = parsed;
  }

  return { name: workflow.name, ok: true, steps, output: lastOutput };
}
