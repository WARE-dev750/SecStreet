import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Project, type AuditEntry } from "@secstreet/project";
import { runCapability } from "@secstreet/runtime";
import { runWorkflow } from "@secstreet/workflow";
import { RegistryClient } from "@secstreet/service-registry";
import { hashJson } from "@secstreet/capability";

export interface WebServerOptions {
  projectRoot: string;
  port?: number;
  host?: string;
}

export interface WebServerHandle {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}


function auditFor(
  manifest: import("@secstreet/contracts").CapabilityManifest,
  integrity: string,
  input: unknown,
  outcome: AuditEntry["outcome"],
  exitCode: number,
  durationMs: number,
  output: unknown,
  opts: { workflow?: string; stepId?: string; kind?: AuditEntry["kind"] } = {}
): AuditEntry {
  return {
    ts: new Date().toISOString(),
    kind: opts.kind ?? "run",
    capability: manifest.name,
    version: manifest.version,
    integrity,
    trust: manifest.trust,
    declared: manifest.permissions as string[],
    inputHash: hashJson(input),
    outputHash: output === undefined ? "" : hashJson(output),
    exitCode,
    durationMs,
    outcome,
    workflow: opts.workflow,
    stepId: opts.stepId,
  };
}

function send(res: ServerResponse, status: number, body: unknown, contentType = "application/json"): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": contentType });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (d) => (s += d.toString()));
    req.on("end", () => {
      try { resolve(s ? JSON.parse(s) : {}); } catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

export async function startWebServer(opts: WebServerOptions): Promise<WebServerHandle> {
  const project = await Project.open(opts.projectRoot);
  const publicDir = join(import.meta.dirname, "..", "public");
  const port = opts.port ?? 5050;
  const host = opts.host ?? "127.0.0.1";

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    try {
      if (p === "/" || p === "/index.html") {
        const html = await readFile(join(publicDir, "index.html"), "utf8");
        return send(res, 200, html, "text/html");
      }
      if (p === "/api/project") {
        const caps = await project.loadInstalled();
        return send(res, 200, {
          name: project.manifestData.name,
          version: project.manifestData.version,
          root: project.root,
          installed: caps.map((c) => ({
            name: c.manifest.name,
            version: c.manifest.version,
            description: c.manifest.description,
            trust: c.manifest.trust,
            risk: c.manifest.risk
          }))
        });
      }
      if (p === "/api/audit") {
        const entries = await project.tailAudit(50);
        return send(res, 200, { entries });
      }
      const capMatch = p.match(/^\/api\/capabilities\/([a-z0-9][a-z0-9-]*)$/);
      if (capMatch) {
        const caps = await project.loadInstalled();
        const c = caps.find((x) => x.manifest.name === capMatch[1]);
        if (!c) return send(res, 404, { error: "not installed: " + capMatch[1] });
        return send(res, 200, c.manifest);
      }
      if (p === "/api/run" && req.method === "POST") {
        const body = await readJson(req) as { name?: string; input?: unknown };
        if (!body.name) return send(res, 400, { error: "name required" });
        const caps = await project.loadInstalled();
        const c = caps.find((x) => x.manifest.name === body.name);
        if (!c) return send(res, 404, { error: "not installed: " + body.name });
        const rec = project.manifestData.installed[body.name];
        const recordedIntegrity = rec?.integrity ?? "";

        const verified = await project.verify(body.name);
        if (!verified[0]?.ok) {
          await project.recordAudit(auditFor(c.manifest, recordedIntegrity, body.input ?? {}, "denied-integrity", 4, 0, undefined));
          return send(res, 200, { ok: false, stdout: "", stderr: "integrity check failed for " + body.name, exitCode: 4, durationMs: 0 });
        }

        const r = await runCapability({ capabilityDir: c.dir, manifest: c.manifest, input: body.input ?? {} });
        if (!r.ok) {
          const outcome: AuditEntry["outcome"] = r.deniedByPolicy ? "denied-policy" : "error";
          await project.recordAudit(auditFor(c.manifest, recordedIntegrity, body.input ?? {}, outcome, r.exitCode, r.durationMs, undefined));
          return send(res, 200, { ok: false, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode, durationMs: r.durationMs });
        }
        const parsed = r.stdout.trim() ? JSON.parse(r.stdout) : undefined;
        await project.recordAudit(auditFor(c.manifest, recordedIntegrity, body.input ?? {}, "ok", 0, r.durationMs, parsed));
        return send(res, 200, { ok: true, stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode, durationMs: r.durationMs });
      }
      if (p === "/api/workflow" && req.method === "POST") {
        const body = await readJson(req) as { file?: string };
        if (!body.file) return send(res, 400, { error: "file required" });
        const all = await project.verify();
        const bad = all.filter((r) => !r.ok);
        if (bad.length) {
          return send(res, 200, { name: "", ok: false, steps: [], error: "integrity check failed for: " + bad.map((r) => r.name).join(", ") });
        }
        const r = await runWorkflow({ workflowPath: resolve(project.root, body.file), capabilitiesDir: project.capabilitiesDir });
        const capsByName = new Map((await project.loadInstalled()).map((c) => [c.manifest.name, c]));
        for (const step of r.steps) {
          const c = capsByName.get(step.capability);
          if (!c) continue;
          const rec = project.manifestData.installed[step.capability];
          const outcome: AuditEntry["outcome"] = step.ok ? "ok" : (step.error?.startsWith("policy denied") ? "denied-policy" : "error");
          await project.recordAudit(auditFor(c.manifest, rec?.integrity ?? "", step.output ?? {}, outcome, step.ok ? 0 : 1, step.durationMs, step.output, { kind: "workflow-step", workflow: r.name, stepId: step.id }));
        }
        return send(res, 200, r);
      }
      if (p === "/api/remote/list") {
        const remoteUrl = url.searchParams.get("url");
        if (!remoteUrl) return send(res, 400, { error: "url required" });
        const client = new RegistryClient(remoteUrl);
        const caps = await client.list();
        return send(res, 200, { capabilities: caps });
      }
      return send(res, 404, { error: "not found: " + p });
    } catch (err) {
      return send(res, 500, { error: (err as Error).message });
    }
  });

  return await new Promise<WebServerHandle>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      resolvePromise({
        server,
        port: actual,
        url: "http://" + host + ":" + actual,
        close: () => new Promise<void>((r) => server.close(() => r()))
      });
    });
  });
}
