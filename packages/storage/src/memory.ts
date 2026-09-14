import type { Storage, StorageFileInfo } from "@secstreet/contracts";

// In-memory Storage. Same semantics as LocalStorage but backed by a Map.
// Used in tests so nothing touches the real filesystem.
export class MemoryStorage implements Storage {
  private files = new Map<string, string>();

  async read(path: string): Promise<string | null> {
    return this.files.has(path) ? this.files.get(path)! : null;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async append(path: string, content: string): Promise<void> {
    const cur = this.files.get(path) ?? "";
    this.files.set(path, cur + content);
  }

  async exists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true;
    // also true if any file is stored under this prefix (acts like a directory)
    const prefix = path.endsWith("/") ? path : path + "/";
    for (const k of this.files.keys()) if (k.startsWith(prefix)) return true;
    return false;
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
    const prefix = path.endsWith("/") ? path : path + "/";
    for (const k of [...this.files.keys()]) {
      if (k.startsWith(prefix)) this.files.delete(k);
    }
  }

  async mkdir(_path: string): Promise<void> {
    // no-op; directories are implicit
  }

  async list(prefix: string): Promise<StorageFileInfo[]> {
    const p = prefix.endsWith("/") ? prefix : prefix + "/";
    const out: StorageFileInfo[] = [];
    for (const [path, content] of this.files.entries()) {
      if (path.startsWith(p)) {
        out.push({ path, name: path.split("/").pop() ?? "", size: content.length });
      }
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }
}
