import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LibraryIndex, CapabilityManifest } from "@secstreet/contracts";

export interface RemoteCapabilitySummary {
  name: string;
  version: string;
  description: string;
  trust: string;
  risk: string;
  language: string;
  permissions: string[];
}

export class RegistryClient {
  constructor(private readonly baseUrl: string) {}
  private url(path: string): string { return this.baseUrl.replace(/\/$/, "") + path; }
  async health(): Promise<{ ok: boolean; libraryDir?: string }> {
    const r = await fetch(this.url("/health"));
    if (!r.ok) throw new Error("health failed: " + r.status);
    return r.json() as Promise<{ ok: boolean; libraryDir?: string }>;
  }
  async index(): Promise<LibraryIndex> {
    const r = await fetch(this.url("/index"));
    if (!r.ok) throw new Error("index failed: " + r.status);
    return r.json() as Promise<LibraryIndex>;
  }
  async list(): Promise<RemoteCapabilitySummary[]> {
    const r = await fetch(this.url("/capabilities"));
    if (!r.ok) throw new Error("list failed: " + r.status);
    const data = await r.json() as { capabilities: RemoteCapabilitySummary[] };
    return data.capabilities;
  }
  async manifest(name: string): Promise<CapabilityManifest> {
    const r = await fetch(this.url("/capabilities/" + encodeURIComponent(name)));
    if (r.status === 404) throw new Error("not found: " + name);
    if (!r.ok) throw new Error("manifest failed: " + r.status);
    return r.json() as Promise<CapabilityManifest>;
  }
  async downloadTo(name: string, targetDir: string): Promise<void> {
    const r = await fetch(this.url("/capabilities/" + encodeURIComponent(name) + "/files"));
    if (r.status === 404) throw new Error("not found: " + name);
    if (!r.ok) throw new Error("files failed: " + r.status);
    const data = await r.json() as { name: string; files: Record<string, string> };
    const capDir = join(targetDir, name);
    await mkdir(capDir, { recursive: true });
    for (const [file, content] of Object.entries(data.files)) {
      const parts = file.split("/");
      const dir = parts.length > 1 ? join(capDir, ...parts.slice(0, -1)) : capDir;
      await mkdir(dir, { recursive: true });
      await writeFile(join(capDir, file), content);
    }
  }
}
