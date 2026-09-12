import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";
import type { Workflow, WorkflowResult, StepResult } from "./types.js";

export interface RunWorkflowOptions {
  workflowPath: string;
  capabilitiesDir: string;
}

export async function runWorkflow(opts: RunWorkflowOptions): Promise<WorkflowResult> {
  const workflowPath = resolve(opts.workflowPath);
  const raw = await readFile(workflowPath, "utf8");
  const workflow = JSON.parse(raw) as Workflow;

  if (!workflow.name) throw new Error("workflow.name is required");
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    throw new Error("workflow.steps must be a non-empty array");
  }

  const registry = await loadRegistry(opts.capabilitiesDir);
  const byName = new Map(registry.map((c) => [c.manifest.name, c]));

  const outputs = new Map<string, unknown>();
  const steps: StepResult[] = [];
  let lastOutput: unknown;

  for (const step of workflow.steps) {
    if (!step.id || !step.capability) {
      return { name: workflow.name, ok: false, steps, error: "each step requires id and capability" };
    }
    if (outputs.has(step.id)) {
      return { name: workflow.name, ok: false, steps, error: `duplicate step id: ${step.id}` };
    }

    const cap = byName.get(step.capability);
    if (!cap) {
      return { name: workflow.name, ok: false, steps, error: `capability not found: ${step.capability}` };
    }

    let input: unknown;
    if (step.from) {
      if (!outputs.has(step.from)) {
        return { name: workflow.name, ok: false, steps, error: `step ${step.id} references unknown step: ${step.from}` };
      }
      input = outputs.get(step.from);
    } else if (step.input !== undefined) {
      input = step.input;
    } else {
      return { name: workflow.name, ok: false, steps, error: `step ${step.id} needs input or from` };
    }

    const result = await runCapability({
      capabilityDir: cap.dir,
      manifest: cap.manifest,
      input
    });

    const stepResult: StepResult = {
      id: step.id,
      capability: step.capability,
      ok: result.ok,
      durationMs: result.durationMs
    };

    if (!result.ok) {
      stepResult.error = result.stderr || `exit code ${result.exitCode}`;
      steps.push(stepResult);
      return { name: workflow.name, ok: false, steps, error: stepResult.error };
    }

    const parsed = result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
    stepResult.output = parsed;
    steps.push(stepResult);
    outputs.set(step.id, parsed);
    lastOutput = parsed;
  }

  return { name: workflow.name, ok: true, steps, output: lastOutput };
}
