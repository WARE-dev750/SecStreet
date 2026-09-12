import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateManifest, type CapabilityManifest } from "@secstreet/contracts";

export interface RegisteredCapability {
  dir: string;
  manifest: CapabilityManifest;
}

export async function loadRegistry(root: string): Promise<RegisteredCapability[]> {
  const out: RegisteredCapability[] = [];
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return out;
  }
  for (const name of entries) {
    const dir = join(root, name);
    const manifestPath = join(dir, "capability.json");
    try {
      const s = await stat(manifestPath);
      if (!s.isFile()) continue;
    } catch {
      continue;
    }
    const raw = JSON.parse(await readFile(manifestPath, "utf8"));
    const check = validateManifest(raw);
    if (!check.ok) {
      throw new Error(`invalid manifest at ${manifestPath}: ${check.errors.join(", ")}`);
    }
    out.push({ dir, manifest: check.value });
  }
  out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  return out;
}
