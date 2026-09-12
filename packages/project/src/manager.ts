import { readFile, writeFile, mkdir, cp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { validateProjectManifest, type ProjectManifest, type InstalledCapabilityRecord } from "@secstreet/contracts";
import { loadRegistry, hashDirectory, type RegisteredCapability } from "@secstreet/capability";
import { TrustStore } from "@secstreet/security";
import { AuditLog, auditPathFor, type AuditEntry } from "./audit.js";
import { verifySignature, readSignature } from "./signature.js";

const MANIFEST = "secstreet.json";

export interface VerifyResult { name: string; ok: boolean; expected: string; actual: string; }

export interface InstallOptions {
  requireSignatureFor?: Array<"verified" | "restricted">;
}

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
    if (!check.ok) throw new Error("invalid " + MANIFEST + ": " + check.errors.join(", "));
    return new Project(root, check.value);
  }

  static async init(root: string, name: string): Promise<Project> {
    if (existsSync(join(root, MANIFEST))) throw new Error(MANIFEST + " already exists in " + root);
    const manifest: ProjectManifest = { name, version: "0.0.1", installed: {} };
    await mkdir(join(root, "capabilities"), { recursive: true });
    await mkdir(join(root, "workflows"), { recursive: true });
    await mkdir(join(root, ".secstreet", "keys"), { recursive: true });
    await writeFile(join(root, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
    await writeFile(join(root, ".gitignore"), "node_modules/\nresults/\n.secstreet/\n");
    return new Project(resolve(root), manifest);
  }

  get manifestData(): ProjectManifest { return this.manifest; }
  get capabilitiesDir(): string { return join(this.root, "capabilities"); }
  get auditLog(): AuditLog { return new AuditLog(auditPathFor(this.root)); }
  get secstreetDir(): string { return join(this.root, ".secstreet"); }
  get keysDir(): string { return join(this.root, ".secstreet", "keys"); }
  get trustPath(): string { return join(this.root, ".secstreet", "trust.json"); }

  async save(): Promise<void> {
    await writeFile(join(this.root, MANIFEST), JSON.stringify(this.manifest, null, 2) + "\n");
  }

  async loadTrustStore(): Promise<TrustStore> {
    return TrustStore.load(this.trustPath);
  }

  async saveTrustStore(store: TrustStore): Promise<void> {
    await store.save(this.trustPath);
  }

  async install(
    capability: RegisteredCapability,
    sourceLabel: string,
    options: InstallOptions = {}
  ): Promise<void> {
    const name = capability.manifest.name;
    const trust = capability.manifest.trust;
    const needsSignature = options.requireSignatureFor?.includes(trust as "verified" | "restricted") ?? false;

    let signedBy: string | undefined;
    let trustVerified: boolean | undefined;

    if (needsSignature) {
      const store = await this.loadTrustStore();
      const sig = await readSignature(capability.dir);
      if (!sig) throw new Error("capability " + name + " has trust=" + trust + " but no signature.json");
      const pub = store.getKey(sig.keyId);
      if (!pub) throw new Error("signature keyId " + sig.keyId + " is not in the trust store");
      if (!store.isTrustedFor(trust as "verified" | "restricted", sig.keyId)) {
        throw new Error("keyId " + sig.keyId + " is not trusted for tier " + trust);
      }
      const result = await verifySignature(capability.dir, capability.manifest, pub);
      if (!result.ok) throw new Error("signature verification failed: " + result.reason);
      signedBy = sig.keyId;
      trustVerified = true;
    } else {
      const sig = await readSignature(capability.dir);
      if (sig) signedBy = sig.keyId;
    }

    const destDir = join(this.capabilitiesDir, name);
    await rm(destDir, { recursive: true, force: true });
    await cp(capability.dir, destDir, { recursive: true });

    const sourceIntegrity = await hashDirectory(capability.dir);
    const destIntegrity = await hashDirectory(destDir);
    if (sourceIntegrity !== destIntegrity) {
      throw new Error("integrity mismatch after copy: " + sourceIntegrity + " != " + destIntegrity);
    }

    const record: InstalledCapabilityRecord = {
      version: capability.manifest.version,
      source: sourceLabel,
      sourcePath: capability.dir,
      installedAt: new Date().toISOString(),
      integrity: destIntegrity,
      signedBy,
      trustVerified,
    };
    this.manifest.installed[name] = record;
    await this.save();
  }

  async remove(name: string): Promise<void> {
    if (!this.manifest.installed[name]) throw new Error("not installed: " + name);
    await rm(join(this.capabilitiesDir, name), { recursive: true, force: true });
    delete this.manifest.installed[name];
    await this.save();
  }

  async recordAudit(entry: AuditEntry): Promise<void> { await this.auditLog.append(entry); }
  async readAudit(): Promise<AuditEntry[]> { return this.auditLog.read(); }
  async tailAudit(n: number): Promise<AuditEntry[]> { return this.auditLog.tail(n); }

  async loadInstalled(): Promise<RegisteredCapability[]> {
    try {
      const s = await stat(this.capabilitiesDir);
      if (!s.isDirectory()) return [];
    } catch { return []; }
    return loadRegistry(this.capabilitiesDir);
  }

  async verify(name?: string): Promise<VerifyResult[]> {
    const names = name ? [name] : Object.keys(this.manifest.installed);
    const results: VerifyResult[] = [];
    for (const n of names) {
      const rec = this.manifest.installed[n];
      if (!rec) throw new Error("not installed: " + n);
      const dir = join(this.capabilitiesDir, n);
      const actual = await hashDirectory(dir);
      const expected = rec.integrity ?? "";
      results.push({ name: n, ok: expected !== "" && actual === expected, expected, actual });
    }
    return results;
  }
}
