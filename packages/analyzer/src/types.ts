import type { LicenseInfo } from "./license.js";

export interface RepoAnalysis {
  url: string;
  owner: string;
  repo: string;
  description: string | null;
  license: LicenseInfo;
  languages: Record<string, number>;
  primaryLanguage: string | null;
  stars: number;
  updatedAt: string | null;
  hasBinaryReleases: boolean;
  recommendation: {
    action: "copy" | "wrap" | "avoid" | "review";
    reason: string;
  };
}
