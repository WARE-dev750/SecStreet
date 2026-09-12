import { readFile, writeFile, mkdir, cp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validateProjectManifest, type ProjectManifest, type InstalledCapabilityRecord } from "@secstreet/contracts";
import { loadRegistry, type RegisteredCapability } from "@secstreet/capability";

const MANIFEST = "secstreet.json";

export class Project {
  private constructor(public readonly root: string, private manifest: ProjectManifest) {}

  static findRoot(start: string): string | null {
    let dir = resolve(start);
    while (true) {
      if (existsSync(join(dir, MANIFEST))) return dir;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  static async open(root: string): Promise<Project> {
    const raw = await readFile(join(root, MANIFEST), "utf8");
    const check = validateProjectManifest(JSON.parse(raw));
    if (!check.ok) throw new Error(`invalid ${MANIFEST}: ${check.errors.join(", ")}`);
    return new Project(root, check.value);
  }

  static async init(root: string, name: string): Promise<Project> {
    if (existsSync(join(root, MANIFEST))) throw new Error(`${MANIFEST} already exists in ${root}`);
    const manifest: ProjectManifest = { name, version: "0.0.1", installed: {} };
    await mkdir(join(root, "capabilities"), { recursive: true });
    await mkdir(join(root, "workflows"), { recursive: true });
    await writeFile(join(root, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
    await writeFile(join(root, ".gitignore"), "node_modules/\nresults/\n.secstreet/\n");
    return new Project(resolve(root), manifest);
  }

  get manifestData(): ProjectManifest { return this.manifest; }
  get capabilitiesDir(): string { return join(this.root, "capabilities"); }

  async save(): Promise<void> {
    await writeFile(join(this.root, MANIFEST), JSON.stringify(this.manifest, null, 2) + "\n");
  }

  async install(capability: RegisteredCapability, sourceLabel: string): Promise<void> {
    const name = capability.manifest.name;
    const destDir = join(this.capabilitiesDir, name);
    await rm(destDir, { recursive: true, force: true });
    await cp(capability.dir, destDir, { recursive: true });
    const record: InstalledCapabilityRecord = {
      version: capability.manifest.version,
      source: sourceLabel,
      sourcePath: capability.dir,
      installedAt: new Date().toISOString(),
    };
    this.manifest.installed[name] = record;
    await this.save();
  }

  async remove(name: string): Promise<void> {
    if (!this.manifest.installed[name]) throw new Error(`not installed: ${name}`);
    await rm(join(this.capabilitiesDir, name), { recursive: true, force: true });
    delete this.manifest.installed[name];
    await this.save();
  }

  async loadInstalled(): Promise<RegisteredCapability[]> {
    try {
      const s = await stat(this.capabilitiesDir);
      if (!s.isDirectory()) return [];
    } catch { return []; }
    return loadRegistry(this.capabilitiesDir);
  }
}
