import { loadRegistry, type RegisteredCapability } from "@secstreet/capability";

export interface LibrarySearchResult extends RegisteredCapability { library: string; }
export interface Library { label: string; path: string; }

export async function listLibrary(lib: Library): Promise<LibrarySearchResult[]> {
  const caps = await loadRegistry(lib.path);
  return caps.map((c) => ({ ...c, library: lib.label }));
}

export interface RankedResult extends LibrarySearchResult {
  score: number;
  matchedOn: string[];
}

export function scoreCapability(manifest: { name: string; description: string; trust: string; risk: string; language: string; permissions: string[]; tags?: string[] }, query: string): { score: number; matchedOn: string[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 1, matchedOn: [] };
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;
  const matchedOn: string[] = [];

  const name = manifest.name.toLowerCase();
  const desc = manifest.description.toLowerCase();
  const tags = (manifest.tags ?? []).map((t) => t.toLowerCase());

  for (const t of tokens) {
    if (name === t) { score += 100; matchedOn.push("name:=" + t); continue; }
    if (name.startsWith(t)) { score += 60; matchedOn.push("name~" + t); continue; }
    if (name.includes(t)) { score += 30; matchedOn.push("name:" + t); }
    if (tags.includes(t)) { score += 40; matchedOn.push("tag:=" + t); }
    else if (tags.some((tag) => tag.includes(t))) { score += 15; matchedOn.push("tag:" + t); }
    if (desc.includes(t)) { score += 10; matchedOn.push("desc:" + t); }
    if (manifest.language.toLowerCase().includes(t)) { score += 8; matchedOn.push("lang:" + t); }
    if (manifest.trust.toLowerCase().includes(t)) { score += 6; matchedOn.push("trust:" + t); }
    if (manifest.risk.toLowerCase().includes(t)) { score += 4; matchedOn.push("risk:" + t); }
    if (manifest.permissions.some((pm) => pm.toLowerCase().includes(t))) { score += 4; matchedOn.push("perm:" + t); }
  }
  return { score, matchedOn };
}

export async function searchLibraryRanked(lib: Library, query: string): Promise<RankedResult[]> {
  const caps = await listLibrary(lib);
  const q = query.trim();
  if (!q) return caps.map((c) => ({ ...c, score: 1, matchedOn: [] }));
  const scored: RankedResult[] = [];
  for (const c of caps) {
    const r = scoreCapability(c.manifest, q);
    if (r.score > 0) scored.push({ ...c, score: r.score, matchedOn: r.matchedOn });
  }
  scored.sort((a, b) => b.score - a.score || a.manifest.name.localeCompare(b.manifest.name));
  return scored;
}

export async function searchLibrary(lib: Library, query: string): Promise<LibrarySearchResult[]> {
  const ranked = await searchLibraryRanked(lib, query);
  return ranked.map(({ score: _s, matchedOn: _m, ...rest }) => rest);
}

export function resolveLibraries(flags: string[]): Library[] {
  const envValue = process.env.SECSTREET_LIBRARY;
  const fromEnv = envValue ? envValue.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const paths = flags.length > 0 ? flags : fromEnv;
  return paths.map((p, i) => ({ label: `library-${i + 1}`, path: p }));
}
