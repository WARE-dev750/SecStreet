import { readFile, writeFile, appendFile, mkdir, rm, stat, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { Storage, StorageFileInfo } from "@secstreet/contracts";

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private abs(path: string): string {
    const cleaned = path.replace(/^\/+/, "");
    const full = resolve(this.root, cleaned);
    const rootResolved = resolve(this.root);
    if (full !== rootResolved && !full.startsWith(rootResolved + "/")) {
      throw new Error("path escapes storage root: " + path);
    }
    return full;
  }

  async read(path: string): Promise<string | null> {
    try {
      return await readFile(this.abs(path), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async write(path: string, content: string): Promise<void> {
    const full = this.abs(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }

  async append(path: string, content: string): Promise<void> {
    const full = this.abs(path);
    await mkdir(dirname(full), { recursive: true });
    await appendFile(full, content, "utf8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(this.abs(path));
      return true;
    } catch {
      return false;
    }
  }

  async remove(path: string): Promise<void> {
    await rm(this.abs(path), { recursive: true, force: true });
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(this.abs(path), { recursive: true });
  }

  async list(prefix: string): Promise<StorageFileInfo[]> {
    const base = this.abs(prefix);
    const out: StorageFileInfo[] = [];
    let baseStat;
    try { baseStat = await stat(base); } catch { return []; }
    if (baseStat.isFile()) {
      const rel = relative(this.root, base).split(/[\\/]/).join("/");
      return [{ path: rel, name: base.split(/[\\/]/).pop() ?? "", size: baseStat.size }];
    }
    async function walk(dir: string): Promise<void> {
      for (const name of await readdir(dir)) {
        const full = join(dir, name);
        const s = await stat(full);
        if (s.isDirectory()) await walk(full);
        else if (s.isFile()) {
          const rel = relative(resolve("."), full).split(/[\\/]/).join("/");
          out.push({ path: rel, name, size: s.size });
        }
      }
    }
    // Walk the subtree, collecting files with paths relative to root.
    async function walk2(root: string, dir: string): Promise<void> {
      for (const name of await readdir(dir)) {
        const full = join(dir, name);
        const s = await stat(full);
        if (s.isDirectory()) await walk2(root, full);
        else if (s.isFile()) {
          const rel = relative(root, full).split(/[\\/]/).join("/");
          out.push({ path: rel, name, size: s.size });
        }
      }
    }
    await walk2(this.root, base);
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }
}
