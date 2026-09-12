import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runWorkflow, checkCompatibility } from "@secstreet/workflow";

const here = dirname(fileURLToPath(import.meta.url));
const CAPS = resolve(here, "../../capabilities/official");
const WORKFLOW = resolve(here, "../../workflows/auth-failures.json");

describe("workflow + compatibility", () => {
  it("runs the auth-failures workflow end-to-end", async () => {
    const result = await runWorkflow({ workflowPath: WORKFLOW, capabilitiesDir: CAPS });
    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.ok)).toBe(true);
    expect(result.output).toEqual({
      summary: [
        { ip: "10.0.0.2", count: 2 },
        { ip: "10.0.0.3", count: 1 },
      ],
    });
  });

  it("reports compatibility between parse-auth-log and filter-failed-logins", async () => {
    const caps = await loadRegistry(CAPS);
    const producer = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    const consumer = caps.find((c) => c.manifest.name === "filter-failed-logins")!;
    const result = await checkCompatibility(producer, consumer);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("field-presence");
    expect(result.missing).toEqual([]);
  });

  it("reports incompatibility when producer is missing a required field", async () => {
    const caps = await loadRegistry(CAPS);
    const producer = caps.find((c) => c.manifest.name === "summarize-failures-by-ip")!;
    const consumer = caps.find((c) => c.manifest.name === "filter-failed-logins")!;
    const result = await checkCompatibility(producer, consumer);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("events");
  });
});
