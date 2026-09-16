import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile, readdir, stat, writeFile, rm, mkdir } from "node:fs/promises";
import { join, resolve, normalize, relative } from "node:path";
import { Project, searchLibraryRanked, listLibrary, type AuditEntry } from "@secstreet/project";
import { runCapability } from "@secstreet/runtime";
import { runWorkflow } from "@secstreet/workflow";
import { RegistryClient } from "@secstreet/service-registry";
import { checkCompatibility } from "@secstreet/workflow";
import { generateAdapter, scaffoldAdapter, MockProvider, OpenAICompatibleProvider } from "@secstreet/ai";
import { hashJson, loadRegistry } from "@secstreet/capability";

export interface WebServerOptions {
  projectRoot: string;
  libraryRoot?: string;
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


const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".secstreet"]);

function safeResolve(root: string, rel: string): string {
  const cleaned = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const full = resolve(root, cleaned);
  const rootResolved = resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + "/")) {
    throw new Error("path escapes project root");
  }
  return full;
}

function langForFile(path: string): string {
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return "javascript";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".sh")) return "shell";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".css")) return "css";
  return "plaintext";
}

interface FileNode {
  path: string;
  name: string;
  type: "file" | "dir";
  children?: FileNode[];
}

async function walkTree(root: string, rel: string): Promise<FileNode[]> {
  const abs = rel ? join(root, rel) : root;
  const entries = await readdir(abs);
  const out: FileNode[] = [];
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".gitignore") continue;
    if (SKIP_DIRS.has(name)) continue;
    const childRel = rel ? rel + "/" + name : name;
    const childAbs = join(root, childRel);
    const st = await stat(childAbs);
    if (st.isDirectory()) {
      out.push({ path: childRel, name, type: "dir", children: await walkTree(root, childRel) });
    } else if (st.isFile()) {
      if (st.size > 512 * 1024) continue; // skip huge files from the tree
      out.push({ path: childRel, name, type: "file" });
    }
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}

function send(res: ServerResponse, status: number, body: unknown, contentType = "application/json"): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store, no-cache, must-revalidate",
    "pragma": "no-cache",
    "expires": "0",
  });
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
  const libraryRoot = opts.libraryRoot
    ?? process.env.SECSTREET_LIBRARY
    ?? join(import.meta.dirname, "..", "..", "..", "capabilities", "official");
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
      if (p === "/styles.css") {
        const css = await readFile(join(publicDir, "styles.css"), "utf8");
        return send(res, 200, css, "text/css");
      }
      if (p === "/app.js") {
        const js = await readFile(join(publicDir, "app.js"), "utf8");
        return send(res, 200, js, "application/javascript");
      }
      if (p === "/icons.js") {
        const js = await readFile(join(publicDir, "icons.js"), "utf8");
        return send(res, 200, js, "application/javascript");
      }
      if (p === "/shared.css") {
        const css = await readFile(join(publicDir, "shared.css"), "utf8");
        return send(res, 200, css, "text/css");
      }
      if (p === "/library.css") {
        const css = await readFile(join(publicDir, "library.css"), "utf8");
        return send(res, 200, css, "text/css");
      }
      if (p === "/library.js") {
        const js = await readFile(join(publicDir, "library.js"), "utf8");
        return send(res, 200, js, "application/javascript");
      }
      const canvasModule = p.match(/^\/canvas\/([a-z][a-z0-9-]*)\.js$/);
      if (canvasModule) {
        try {
          const js = await readFile(join(publicDir, "canvas", canvasModule[1] + ".js"), "utf8");
          return send(res, 200, js, "application/javascript");
        } catch {
          return send(res, 404, { error: "canvas module not found: " + canvasModule[1] });
        }
      }

      if (p === "/canvas.js") {
        const js = await readFile(join(publicDir, "canvas.js"), "utf8");
        return send(res, 200, js, "application/javascript");
      }
      if (p === "/workspace-canvas.js") {
        const js = await readFile(join(publicDir, "workspace-canvas.js"), "utf8");
        return send(res, 200, js, "application/javascript");
      }
      if (p === "/canvas" || p === "/canvas-workspace.html") {
        const html = await readFile(join(publicDir, "canvas-workspace.html"), "utf8");
        return send(res, 200, html, "text/html");
      }
      if (p === "/canvas-workspace.css") {
        const css = await readFile(join(publicDir, "canvas-workspace.css"), "utf8");
        return send(res, 200, css, "text/css");
      }
      if (p === "/canvas-workspace.js") {
        const js = await readFile(join(publicDir, "canvas-workspace.js"), "utf8");
        return send(res, 200, js, "application/javascript");
      }
      if (p === "/canvas" || p === "/canvas-workspace.html") {
        const html = await readFile(join(publicDir, "canvas-workspace.html"), "utf8");
        return send(res, 200, html, "text/html");
      }
      if (p === "/canvas-workspace.css") {
        const css = await readFile(join(publicDir, "canvas-workspace.css"), "utf8");
        return send(res, 200, css, "text/css");
      }
      if (p === "/canvas-workspace.js") {
        const js = await readFile(join(publicDir, "canvas-workspace.js"), "utf8");
        return send(res, 200, js, "application/javascript");
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
            risk: c.manifest.risk,
            category: c.manifest.category ?? "neutral"
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
      if (p === "/api/files/upload" && req.method === "POST") {
        const body = await readJson(req) as { target?: string; files?: Array<{ name?: string; content?: string }> };
        const target = typeof body.target === "string" ? body.target : "";
        const files = Array.isArray(body.files) ? body.files : [];
        if (!files.length) return send(res, 400, { ok: false, error: "no files" });
        const written: string[] = [];
        const rejected: Array<{ name: string; reason: string }> = [];
        for (const f of files) {
          const name = String(f.name || "").trim();
          if (!name) { rejected.push({ name: "(blank)", reason: "empty name" }); continue; }
          if (name.includes("/") || name.includes("\\") || name.startsWith(".")) {
            rejected.push({ name, reason: "invalid name" });
            continue;
          }
          if (typeof f.content !== "string") { rejected.push({ name, reason: "missing content" }); continue; }
          const rel = target ? target.replace(/\/+$/, "") + "/" + name : name;
          let abs: string;
          try { abs = safeResolve(project.root, rel); }
          catch { rejected.push({ name, reason: "path escapes project" }); continue; }
          try {
            await writeFile(abs, f.content, "utf8");
            written.push(rel);
          } catch (err) {
            rejected.push({ name, reason: (err as Error).message });
          }
        }
        return send(res, 200, { ok: true, written, rejected });
      }

      if (p === "/api/files") {
        const tree = await walkTree(project.root, "");
        return send(res, 200, { root: project.root, tree });
      }
      if (p === "/api/file" && req.method === "GET") {
        const rel = url.searchParams.get("path");
        if (!rel) return send(res, 400, { error: "path required" });
        const abs = safeResolve(project.root, rel);
        const st = await stat(abs).catch(() => null);
        if (!st || !st.isFile()) return send(res, 404, { error: "not a file: " + rel });
        const content = await readFile(abs, "utf8");
        return send(res, 200, { path: rel, content, language: langForFile(rel), size: st.size });
      }
      if (p === "/api/file" && req.method === "PUT") {
        const rel = url.searchParams.get("path");
        if (!rel) return send(res, 400, { error: "path required" });
        const abs = safeResolve(project.root, rel);
        const body = await readJson(req) as { content?: string };
        if (typeof body.content !== "string") return send(res, 400, { error: "content required" });
        await writeFile(abs, body.content, "utf8");
        return send(res, 200, { ok: true, path: rel, bytes: body.content.length });
      }
      if (p === "/api/ai/adapter" && req.method === "POST") {
        const body = await readJson(req) as { producer?: string; consumer?: string; adapterName?: string };
        if (!body.producer || !body.consumer) {
          return send(res, 400, { ok: false, error: "producer and consumer required" });
        }
        const caps = await project.loadInstalled();
        const producer = caps.find((c) => c.manifest.name === body.producer);
        const consumer = caps.find((c) => c.manifest.name === body.consumer);
        if (!producer) return send(res, 404, { ok: false, error: "not installed: " + body.producer });
        if (!consumer) return send(res, 404, { ok: false, error: "not installed: " + body.consumer });

        const compat = await checkCompatibility(producer, consumer);
        if (compat.ok) {
          return send(res, 200, {
            ok: true,
            alreadyCompatible: true,
            reason: producer.manifest.name + " output already satisfies " + consumer.manifest.name + " input",
          });
        }

        const provider = new MockProvider();
        const generated = await generateAdapter({
          producer, consumer, adapterName: body.adapterName, provider,
        });

        const staging = join(project.root, ".secstreet", "staging-ai");
        await rm(staging, { recursive: true, force: true });
        await mkdir(staging, { recursive: true });
        await scaffoldAdapter({
          root: staging,
          generated,
          producerName: producer.manifest.name,
          consumerName: consumer.manifest.name,
        });
        const staged = await loadRegistry(staging);
        const adapterCap = staged.find((c) => c.manifest.name === generated.adapterName);
        if (!adapterCap) throw new Error("generated adapter not found after scaffold");
        await project.install(adapterCap, "ai:" + generated.provider + "/" + generated.model);

        return send(res, 200, {
          ok: true,
          alreadyCompatible: false,
          adapterName: generated.adapterName,
          rationale: generated.rationale,
          provider: generated.provider,
          model: generated.model,
        });
      }
      if (p === "/api/ai/ask" && req.method === "POST") {
        const body = await readJson(req) as { prompt?: string; context?: string };
        if (!body.prompt) return send(res, 400, { ok: false, error: "prompt required" });
        const endpoint = process.env.SECSTREET_AI_ENDPOINT;
        const model = process.env.SECSTREET_AI_MODEL;
        if (!endpoint || !model) {
          return send(res, 200, { ok: false, error: "AI not configured. Set SECSTREET_AI_ENDPOINT and SECSTREET_AI_MODEL in .env." });
        }
        const provider = new OpenAICompatibleProvider({
          endpoint,
          model,
          apiKey: process.env.SECSTREET_AI_KEY,
          timeoutMs: Number(process.env.SECSTREET_AI_TIMEOUT_MS ?? "60000"),
        });
        const system = "You are a security code analyst. Answer precisely and concisely. No filler, no disclaimers, no hedging.";
        const user = (body.context ? "File content:\n\n" + body.context + "\n\n" : "") + "Question: " + body.prompt;
        try {
          const result = await provider.complete({ system, user });
          return send(res, 200, { ok: true, answer: result.text, provider: result.provider, model: result.model });
        } catch (err) {
          return send(res, 200, { ok: false, error: (err as Error).message });
        }
      }
      if (p === "/library") {
        const html = await readFile(join(publicDir, "library.html"), "utf8");
        return send(res, 200, html, "text/html");
      }
      if (p === "/api/library") {
        const caps = await listLibrary({ label: "official", path: libraryRoot });
        return send(res, 200, {
          root: libraryRoot,
          count: caps.length,
          capabilities: caps.map((c) => ({
            name: c.manifest.name,
            version: c.manifest.version,
            description: c.manifest.description,
            language: c.manifest.language,
            trust: c.manifest.trust,
            risk: c.manifest.risk,
            permissions: c.manifest.permissions,
            tags: c.manifest.tags ?? [],
            category: c.manifest.category ?? "neutral",
          })),
        });
      }
      if (p === "/api/library/search") {
        const q = url.searchParams.get("q") ?? "";
        const results = await searchLibraryRanked({ label: "official", path: libraryRoot }, q);
        return send(res, 200, {
          query: q,
          count: results.length,
          results: results.map((r) => ({
            name: r.manifest.name,
            version: r.manifest.version,
            description: r.manifest.description,
            language: r.manifest.language,
            trust: r.manifest.trust,
            risk: r.manifest.risk,
            permissions: r.manifest.permissions,
            tags: r.manifest.tags ?? [],
            category: r.manifest.category ?? "neutral",
            score: r.score,
            matchedOn: r.matchedOn,
          })),
        });
      }
      if (p === "/api/library/install" && req.method === "POST") {
        const body = await readJson(req) as { name?: string };
        if (!body.name) return send(res, 400, { ok: false, error: "name required" });
        const caps = await listLibrary({ label: "official", path: libraryRoot });
        const c = caps.find((x) => x.manifest.name === body.name);
        if (!c) return send(res, 404, { ok: false, error: "not in library: " + body.name });
        try {
          await project.install(c, "library:official", { requireSignatureFor: ["verified", "restricted"] });
          return send(res, 200, { ok: true, name: c.manifest.name, version: c.manifest.version });
        } catch (err) {
          return send(res, 500, { ok: false, error: (err as Error).message });
        }
      }
      if (p === "/api/library/export" && req.method === "POST") {
        const body = await readJson(req) as { name?: string; targetPath?: string };
        if (!body.name) return send(res, 400, { ok: false, error: "name required" });
        const target = body.targetPath ?? "";
        const caps = await listLibrary({ label: "official", path: libraryRoot });
        const c = caps.find((x) => x.manifest.name === body.name);
        if (!c) return send(res, 404, { ok: false, error: "not in library: " + body.name });
        const entryRel = c.manifest.entrypoint;
        const entryAbs = join(c.dir, entryRel);
        const ext = entryRel.includes(".") ? "." + entryRel.split(".").pop() : "";
        const targetDir = safeResolve(project.root, target);
        await mkdir(targetDir, { recursive: true });
        const outName = body.name + ext;
        const outAbs = join(targetDir, outName);
        const content = await readFile(entryAbs, "utf8");
        await writeFile(outAbs, content, "utf8");
        const rel = relative(project.root, outAbs).split(/[\\/]/).join("/");
        return send(res, 200, { ok: true, path: rel });
      }
      const libCapMatch = p.match(/^\/api\/library\/([a-z0-9][a-z0-9-]*)$/);
      if (libCapMatch) {
        const name = libCapMatch[1];
        const caps = await listLibrary({ label: "official", path: libraryRoot });
        const c = caps.find((x) => x.manifest.name === name);
        if (!c) return send(res, 404, { error: "not in library: " + name });
        let entrypointCode = "";
        try {
          entrypointCode = await readFile(join(c.dir, c.manifest.entrypoint), "utf8");
        } catch { /* leave empty */ }
        let inputSchema: unknown = null;
        try { inputSchema = JSON.parse(await readFile(join(c.dir, c.manifest.inputSchema), "utf8")); } catch { /* leave null */ }
        let outputSchema: unknown = null;
        try { outputSchema = JSON.parse(await readFile(join(c.dir, c.manifest.outputSchema), "utf8")); } catch { /* leave null */ }
        return send(res, 200, {
          manifest: c.manifest,
          entrypointCode,
          inputSchema,
          outputSchema,
        });
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
