import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist"]);

export async function hashDirectory(root: string): Promise<string> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir);
    for (const name of entries) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      const s = await stat(full);
      if (s.isDirectory()) await walk(full);
      else if (s.isFile()) files.push(full);
    }
  }
  await walk(root);
  files.sort();
  const hash = createHash("sha256");
  for (const f of files) {
    const rel = relative(root, f).split(/[\\/]/).join("/");
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(f));
    hash.update("\0");
  }
  return "sha256-" + hash.digest("hex");
}
