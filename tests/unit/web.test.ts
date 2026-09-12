import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Project, listLibrary } from "@secstreet/project";
import { startWebServer } from "@secstreet/app-web";

const here = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(here, "../../capabilities/official");

describe("web IDE", () => {
  let tmp: string;
  let handle: Awaited<ReturnType<typeof startWebServer>>;
  let url: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "secstreet-web-"));
    const p = await Project.init(join(tmp, "proj"), "proj");
    const caps = await listLibrary({ label: "lib", path: LIB });
    const cap = caps.find((c) => c.manifest.name === "parse-auth-log")!;
    await p.install(cap, LIB);
    handle = await startWebServer({ projectRoot: p.root, port: 0 });
    url = handle.url;
  });

  afterEach(async () => {
    await handle.close();
    await rm(tmp, { recursive: true, force: true });
  });

  it("serves index.html at /", async () => {
    const r = await fetch(url + "/");
    expect(r.ok).toBe(true);
    const html = await r.text();
    expect(html).toContain("SecStreet");
  });

  it("reports project state", async () => {
    const r = await fetch(url + "/api/project");
    const data = await r.json() as { name: string; installed: Array<{ name: string }> };
    expect(data.name).toBe("proj");
    expect(data.installed.map((c) => c.name)).toContain("parse-auth-log");
  });

  it("serves a manifest", async () => {
    const r = await fetch(url + "/api/capabilities/parse-auth-log");
    const m = await r.json() as { name: string };
    expect(m.name).toBe("parse-auth-log");
  });

  it("runs a capability through the API", async () => {
    const r = await fetch(url + "/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "parse-auth-log",
        input: { text: "Jan 10 12:00:01 host sshd[1]: Failed password for bob from 10.0.0.2 port 22 ssh2" }
      })
    });
    const data = await r.json() as { ok: boolean; stdout: string; durationMs: number };
    expect(data.ok).toBe(true);
    expect(JSON.parse(data.stdout).events).toHaveLength(1);
  });

  it("returns 404 for an unknown capability", async () => {
    const r = await fetch(url + "/api/capabilities/nope");
    expect(r.status).toBe(404);
  });
});
