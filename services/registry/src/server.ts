import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadRegistry, hashDirectory } from "@secstreet/capability";

export interface RegistryServerOptions {
  libraryDir: string;
  port?: number;
  host?: string;
  libraryName?: string;
  libraryVersion?: string;
  maintainer?: string;
}

export interface RegistryServerHandle {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

async function listFiles(dir: string, base = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) {
      const nested = await listFiles(full, base ? base + "/" + name : name);
      Object.assign(out, nested);
    } else if (s.isFile()) {
      out[base ? base + "/" + name : name] = await readFile(full, "utf8");
    }
  }
  return out;
}

function send(res: ServerResponse, status: number, body: unknown, contentType = "application/json"): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": contentType });
  res.end(payload);
}

export async function startRegistryServer(opts: RegistryServerOptions): Promise<RegistryServerHandle> {
  const libraryDir = resolve(opts.libraryDir);
  const port = opts.port ?? 8787;
  const host = opts.host ?? "127.0.0.1";

  // Build a fresh in-memory index each request cycle. No caching for V0.
  let indexPromise: Promise<unknown> | null = null;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;

      if (req.method !== "GET") {
        return send(res, 405, { error: "method not allowed" });
      }

      if (path === "/health") {
        return send(res, 200, { ok: true, libraryDir });
      }

      if (path === "/index") {
        // Lazy build so new capabilities picked up on next index call.
        if (!indexPromise) {
          indexPromise = (async () => {
            const caps = await loadRegistry(libraryDir);
            const entries = [];
            for (const c of caps) {
              const integrity = await hashDirectory(c.dir);
              entries.push({
                name: c.manifest.name,
                version: c.manifest.version,
                path: c.manifest.name,
                integrity,
                signature: null,
                manifest: c.manifest,
              });
            }
            entries.sort((a, b) => a.name.localeCompare(b.name));
            return {
              libraryName: opts.libraryName ?? "library",
              libraryVersion: opts.libraryVersion ?? "0.1.0",
              maintainer: opts.maintainer ?? "unknown",
              generatedAt: new Date().toISOString(),
              capabilities: entries,
            };
          })();
        }
        const index = await indexPromise;
        return send(res, 200, index);
      }

      if (path === "/capabilities") {
        const caps = await loadRegistry(libraryDir);
        return send(res, 200, {
          capabilities: caps.map((c) => ({
            name: c.manifest.name,
            version: c.manifest.version,
            description: c.manifest.description,
            trust: c.manifest.trust,
            risk: c.manifest.risk,
            language: c.manifest.language,
            permissions: c.manifest.permissions,
          })),
        });
      }

      const manifestMatch = path.match(/^\/capabilities\/([a-z0-9][a-z0-9-]*)$/);
      if (manifestMatch) {
        const name = manifestMatch[1];
        const caps = await loadRegistry(libraryDir);
        const cap = caps.find((c) => c.manifest.name === name);
        if (!cap) return send(res, 404, { error: "capability not found: " + name });
        return send(res, 200, cap.manifest);
      }

      const filesMatch = path.match(/^\/capabilities\/([a-z0-9][a-z0-9-]*)\/files$/);
      if (filesMatch) {
        const name = filesMatch[1];
        const caps = await loadRegistry(libraryDir);
        const cap = caps.find((c) => c.manifest.name === name);
        if (!cap) return send(res, 404, { error: "capability not found: " + name });
        const files = await listFiles(cap.dir);
        return send(res, 200, { name, files });
      }

      return send(res, 404, { error: "not found: " + path });
    } catch (err) {
      return send(res, 500, { error: (err as Error).message });
    }
  });

  return await new Promise<RegistryServerHandle>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      resolvePromise({
        server,
        port: actualPort,
        url: "http://" + host + ":" + actualPort,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
