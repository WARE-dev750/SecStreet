import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Project, listLibrary } from "@secstreet/project";

const LIB = resolve(__dirname, "../../capabilities/official");

describe("Project + library", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("creates a project with secstreet.json", async () => {
    const project = await Project.init(join(tmp, "demo"), "demo");
    expect(project.manifestData.name).toBe("demo");
    expect(project.manifestData.installed).toEqual({});
  });

  it("installs a capability from a library", async () => {
    const project = await Project.init(join(tmp, "demo"), "demo");
    const caps = await listLibrary({ label: "official", path: LIB });
    const target = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await project.install(target, LIB);
    const installed = await project.loadInstalled();
    expect(installed.map((c) => c.manifest.name)).toContain("parse-auth-log");
  });

  it("removes an installed capability", async () => {
    const project = await Project.init(join(tmp, "demo"), "demo");
    const caps = await listLibrary({ label: "official", path: LIB });
    const target = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await project.install(target, LIB);
    await project.remove("parse-auth-log");
    expect(await project.loadInstalled()).toHaveLength(0);
  });
});
