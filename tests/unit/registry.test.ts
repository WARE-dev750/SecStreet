import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadRegistry } from "@secstreet/capability";
import { runCapability } from "@secstreet/runtime";

const CAPS = resolve(__dirname, "../../capabilities/official");

describe("registry + runtime", () => {
  it("loads official capabilities", async () => {
    const caps = await loadRegistry(CAPS);
    expect(caps.length).toBeGreaterThanOrEqual(1);
    expect(caps.map((c) => c.manifest.name)).toContain("parse-auth-log");
  });

  it("runs parse-auth-log end-to-end", async () => {
    const caps = await loadRegistry(CAPS);
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log");
    if (!cap) throw new Error("missing capability");
    const input = {
      text: [
        "Jan 10 12:00:01 host sshd[123]: Accepted password for alice from 10.0.0.1 port 22 ssh2",
        "Jan 10 12:00:02 host sshd[124]: Failed password for bob from 10.0.0.2 port 22 ssh2"
      ].join("\n")
    };
    const result = await runCapability({ capabilityDir: cap.dir, manifest: cap.manifest, input });
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.events).toHaveLength(2);
    expect(parsed.events[0]).toMatchObject({ user: "alice", ip: "10.0.0.1", result: "success" });
    expect(parsed.events[1]).toMatchObject({ user: "bob", ip: "10.0.0.2", result: "failure" });
  });
});
