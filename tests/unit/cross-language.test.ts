import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runWorkflow, checkCompatibility } from "@secstreet/workflow";

const here = dirname(fileURLToPath(import.meta.url));
const CAPS = resolve(here, "../../capabilities/official");
const WORKFLOW = resolve(here, "../../workflows/auth-source-ips.json");

describe("cross-language workflows", () => {
  it("registers a python capability alongside javascript capabilities", async () => {
    const caps = await loadRegistry(CAPS);
    const py = caps.find((c) => c.manifest.name === "extract-source-ips");
    expect(py).toBeDefined();
    expect(py!.manifest.language).toBe("python");
  });

  it("runs a Node → Node → Python workflow end to end", async () => {
    const result = await runWorkflow({ workflowPath: WORKFLOW, capabilitiesDir: CAPS });
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.capability)).toEqual([
      "parse-auth-log",
      "filter-failed-logins",
      "extract-source-ips",
    ]);
    expect(result.output).toEqual({ ips: ["10.0.0.2", "10.0.0.3"] });
  });

  it("field-presence compatibility holds across languages", async () => {
    const caps = await loadRegistry(CAPS);
    const producer = caps.find((c) => c.manifest.name === "filter-failed-logins")!;
    const consumer = caps.find((c) => c.manifest.name === "extract-source-ips")!;
    const result = await checkCompatibility(producer, consumer);
    expect(result.ok).toBe(true);
  });
});
