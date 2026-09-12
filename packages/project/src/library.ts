import { loadRegistry, type RegisteredCapability } from "@secstreet/capability";

export interface LibrarySearchResult extends RegisteredCapability { library: string; }
export interface Library { label: string; path: string; }

export async function listLibrary(lib: Library): Promise<LibrarySearchResult[]> {
  const caps = await loadRegistry(lib.path);
  return caps.map((c) => ({ ...c, library: lib.label }));
}

export async function searchLibrary(lib: Library, query: string): Promise<LibrarySearchResult[]> {
  const q = query.trim().toLowerCase();
  const caps = await listLibrary(lib);
  if (!q) return caps;
  return caps.filter((c) => {
    const m = c.manifest;
    return m.name.toLowerCase().includes(q)
        || m.description.toLowerCase().includes(q)
        || m.risk.toLowerCase().includes(q)
        || m.trust.toLowerCase().includes(q);
  });
}

export function resolveLibraries(flags: string[]): Library[] {
  const envValue = process.env.SECSTREET_LIBRARY;
  const fromEnv = envValue ? envValue.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const paths = flags.length > 0 ? flags : fromEnv;
  return paths.map((p, i) => ({ label: `library-${i + 1}`, path: p }));
}
