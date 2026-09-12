import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Project, listLibrary } from "@secstreet/project";
import { hashDirectory } from "@secstreet/capability";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../capabilities/official");

describe("integrity", () => {
  let tmp: string;
  beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "secstreet-int-")); });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("hashDirectory is deterministic", async () => {
    const h1 = await hashDirectory(LIB);
    const h2 = await hashDirectory(LIB);
    expect(h1).toBe(h2);
    expect(h1.startsWith("sha256-")).toBe(true);
  });

  it("install records integrity hash and verify passes", async () => {
    const p = await Project.init(join(tmp, "proj"), "proj");
    const caps = await listLibrary({ label: "lib", path: LIB });
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await p.install(cap, LIB);

    const rec = p.manifestData.installed["parse-auth-log"];
    expect(rec?.integrity).toMatch(/^sha256-[0-9a-f]{64}$/);

    const [r] = await p.verify("parse-auth-log");
    expect(r.ok).toBe(true);
    expect(r.expected).toBe(r.actual);
  });

  it("verify fails after a file in the installed capability is modified", async () => {
    const p = await Project.init(join(tmp, "proj"), "proj");
    const caps = await listLibrary({ label: "lib", path: LIB });
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await p.install(cap, LIB);

    const target = join(p.capabilitiesDir, "parse-auth-log", "index.js");
    await writeFile(target, "\n// tampered\n", { flag: "a" });

    const [r] = await p.verify("parse-auth-log");
    expect(r.ok).toBe(false);
    expect(r.expected).not.toBe(r.actual);
  });

  it("reinstall restores integrity", async () => {
    const p = await Project.init(join(tmp, "proj"), "proj");
    const caps = await listLibrary({ label: "lib", path: LIB });
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await p.install(cap, LIB);

    const target = join(p.capabilitiesDir, "parse-auth-log", "index.js");
    await writeFile(target, "\n// tampered\n", { flag: "a" });
    expect((await p.verify("parse-auth-log"))[0].ok).toBe(false);

    await p.install(cap, LIB);
    expect((await p.verify("parse-auth-log"))[0].ok).toBe(true);
  });
});
