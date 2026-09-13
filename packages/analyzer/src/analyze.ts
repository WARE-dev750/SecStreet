import { detectLicenseFromText, classifyLicense, type LicenseInfo } from "./license.js";
import type { RepoAnalysis } from "./types.js";

export interface GitHubRepoMeta {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  updated_at: string | null;
  language: string | null;
  license: { spdx_id?: string | null } | null;
  default_branch: string;
}

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  const owner = m[1];
  const rawRepo = m[2];
  if (!owner || !rawRepo) return null;
  return { owner, repo: rawRepo.replace(/\.git$/, "") };
}

export function recommend(license: LicenseInfo, hasBinaryReleases: boolean): RepoAnalysis["recommendation"] {
  if (license.verdict === "permissive") {
    return {
      action: "copy",
      reason: "Permissive license (" + license.spdx + "). Safe to copy source with attribution.",
    };
  }
  if (license.verdict === "copyleft") {
    if (hasBinaryReleases) {
      return {
        action: "wrap",
        reason: "Copyleft license (" + license.spdx + "). Do not copy source. Wrap the binary as a subprocess.",
      };
    }
    return {
      action: "avoid",
      reason: "Copyleft license (" + license.spdx + ") and no known binary releases. No safe integration path without clean-room reimplementation.",
    };
  }
  return {
    action: "review",
    reason: "License is unknown or unsupported. Read the LICENSE file manually before doing anything.",
  };
}

export async function analyzeRepo(url: string, fetchImpl: FetchLike): Promise<RepoAnalysis> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error("not a GitHub URL: " + url);
  const { owner, repo } = parsed;

  const apiBase = "https://api.github.com/repos/" + owner + "/" + repo;
  const headers: Record<string, string> = {
    "accept": "application/vnd.github+json",
    "user-agent": "secstreet-analyzer",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers["authorization"] = "Bearer " + token;

  const metaRes = await fetchImpl(apiBase, { headers });
  if (!metaRes.ok) {
    throw new Error("GitHub API " + metaRes.status + " for " + apiBase);
  }
  const meta = await metaRes.json() as GitHubRepoMeta;

  // License may come from metadata as spdx_id, else we fetch the file.
  let license = classifyLicense(meta.license?.spdx_id ?? "");
  if (license.verdict === "unknown") {
    const licenseUrl = "https://raw.githubusercontent.com/" + owner + "/" + repo + "/" + (meta.default_branch || "main") + "/LICENSE";
    try {
      const r = await fetchImpl(licenseUrl, { headers: { "user-agent": "secstreet-analyzer" } });
      if (r.ok) {
        const text = await r.text();
        license = detectLicenseFromText(text);
      }
    } catch {
      // leave as unknown
    }
  }

  // Language breakdown
  let languages: Record<string, number> = {};
  try {
    const langRes = await fetchImpl(apiBase + "/languages", { headers });
    if (langRes.ok) languages = await langRes.json() as Record<string, number>;
  } catch {
    // leave empty
  }

  // Releases — presence of downloadable binaries matters for wrap eligibility
  let hasBinaryReleases = false;
  try {
    const relRes = await fetchImpl(apiBase + "/releases?per_page=5", { headers });
    if (relRes.ok) {
      const releases = await relRes.json() as Array<{ assets?: Array<{ name?: string }> }>;
      hasBinaryReleases = releases.some((r) => (r.assets ?? []).some((a) => (a.name ?? "").length > 0));
    }
  } catch {
    // leave false
  }

  const primaryLanguage = meta.language ?? null;

  return {
    url,
    owner,
    repo,
    description: meta.description,
    license,
    languages,
    primaryLanguage,
    stars: meta.stargazers_count,
    updatedAt: meta.updated_at,
    hasBinaryReleases,
    recommendation: recommend(license, hasBinaryReleases),
  };
}
