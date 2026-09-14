import type { Storage, StorageFileInfo } from "@secstreet/contracts";

// SupabaseStorage implements Storage against a Postgres table. Requires:
//
//   create table secstreet_files (
//     path text primary key,
//     content text not null,
//     updated_at timestamptz default now()
//   );
//
// Construct with your project URL and service_role key from Supabase
// settings. Only three endpoints are used: select, upsert, delete.
export interface SupabaseStorageOptions {
  url: string;
  key: string;
  table?: string;
}

export class SupabaseStorage implements Storage {
  private readonly table: string;
  constructor(private readonly opts: SupabaseStorageOptions) {
    this.table = opts.table ?? "secstreet_files";
  }

  private headers(): Record<string, string> {
    return {
      "apikey": this.opts.key,
      "authorization": "Bearer " + this.opts.key,
      "content-type": "application/json",
      "prefer": "resolution=merge-duplicates,return=minimal",
    };
  }

  private restUrl(query: string): string {
    return this.opts.url.replace(/\/$/, "") + "/rest/v1/" + this.table + query;
  }

  async read(path: string): Promise<string | null> {
    const r = await fetch(this.restUrl("?path=eq." + encodeURIComponent(path) + "&select=content"), { headers: this.headers() });
    if (!r.ok) throw new Error("supabase read " + r.status);
    const rows = await r.json() as Array<{ content: string }>;
    return rows[0]?.content ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    const r = await fetch(this.restUrl(""), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify([{ path, content }]),
    });
    if (!r.ok) throw new Error("supabase write " + r.status + " " + (await r.text()).slice(0, 200));
  }

  async append(path: string, content: string): Promise<void> {
    const cur = (await this.read(path)) ?? "";
    await this.write(path, cur + content);
  }

  async exists(path: string): Promise<boolean> {
    const r = await fetch(this.restUrl("?path=eq." + encodeURIComponent(path) + "&select=path&limit=1"), { headers: this.headers() });
    if (!r.ok) return false;
    const rows = await r.json() as Array<{ path: string }>;
    return rows.length > 0;
  }

  async remove(path: string): Promise<void> {
    const r = await fetch(this.restUrl("?path=eq." + encodeURIComponent(path)), {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!r.ok) throw new Error("supabase remove " + r.status);
  }

  async mkdir(_path: string): Promise<void> {
    // no-op; directories are implicit
  }

  async list(prefix: string): Promise<StorageFileInfo[]> {
    const p = prefix.endsWith("/") ? prefix : prefix + "/";
    const r = await fetch(this.restUrl("?path=like." + encodeURIComponent(p + "%") + "&select=path,content"), { headers: this.headers() });
    if (!r.ok) return [];
    const rows = await r.json() as Array<{ path: string; content: string }>;
    return rows.map((row) => ({
      path: row.path,
      name: row.path.split("/").pop() ?? "",
      size: row.content.length,
    })).sort((a, b) => a.path.localeCompare(b.path));
  }
}
