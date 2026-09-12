export type Permission =
  | "filesystem:read"
  | "filesystem:write"
  | "network"
  | "subprocess"
  | "env:read"
  | "env:write";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "filesystem:read",
  "filesystem:write",
  "network",
  "subprocess",
  "env:read",
  "env:write",
] as const;

export interface PolicyTier {
  maxPermissions: Permission[];
}

export interface Policy {
  community: PolicyTier;
  professional: PolicyTier;
  verified: PolicyTier;
  restricted: PolicyTier;
}

export const DEFAULT_POLICY: Policy = {
  community: { maxPermissions: [] },
  professional: { maxPermissions: ["filesystem:read", "env:read"] },
  verified: { maxPermissions: ["filesystem:read", "filesystem:write", "env:read", "network"] },
  restricted: { maxPermissions: [...ALL_PERMISSIONS] },
};
