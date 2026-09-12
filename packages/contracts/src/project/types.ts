export interface InstalledCapabilityRecord {
  version: string;
  source: string;
  sourcePath: string;
  installedAt: string;
  integrity?: string;
  signedBy?: string;
  trustVerified?: boolean;
}
export interface ProjectManifest {
  name: string;
  version: string;
  installed: Record<string, InstalledCapabilityRecord>;
}
