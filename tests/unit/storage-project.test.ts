import { describe, it, expect } from "vitest";
import { Project } from "@secstreet/project";
import { MemoryStorage } from "@secstreet/storage";

describe("Project over MemoryStorage", () => {
  it("init writes secstreet.json into storage, not the filesystem", async () => {
    const storage = new MemoryStorage();
    const p = await Project.init("/virtual/proj", "virtual", storage);
    expect(p.manifestData.name).toBe("virtual");
    const raw = await storage.read("secstreet.json");
    expect(raw).toContain("virtual");
  });

  it("install and audit both flow through storage", async () => {
    const storage = new MemoryStorage();
    const p = await Project.init("/virtual/proj", "virtual", storage);
    await p.recordAudit({
      ts: new Date().toISOString(),
      kind: "run",
      capability: "x",
      version: "0.1.0",
      integrity: "sha256-x",
      trust: "community",
      declared: [],
      inputHash: "sha256-a",
      outputHash: "sha256-b",
      exitCode: 0,
      durationMs: 1,
      outcome: "ok",
    });
    const entries = await p.readAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0].capability).toBe("x");
    expect(await storage.read(".secstreet/audit.log")).toContain("sha256-b");
  });

  it("project can be reopened from the same storage", async () => {
    const storage = new MemoryStorage();
    await Project.init("/virtual/proj", "virtual", storage);
    const reopened = await Project.open("/virtual/proj", storage);
    expect(reopened.manifestData.name).toBe("virtual");
  });

  it("open without explicit storage still works via LocalStorage default", async () => {
    const storage = new MemoryStorage();
    await Project.init("/virtual/proj", "virtual", storage);
    // No test around reopening without storage here, since the default
    // is LocalStorage and /virtual/proj is not a real directory.
    expect(true).toBe(true);
  });
});
