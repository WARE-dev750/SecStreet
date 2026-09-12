import type { CapabilityManifest, Policy, Permission } from "@secstreet/contracts";

export interface PolicyDecision {
  allowed: boolean;
  trust: string;
  declared: Permission[];
  allowedPermissions: Permission[];
  disallowed: Permission[];
  reason?: string;
}

export function evaluatePolicy(manifest: CapabilityManifest, policy: Policy): PolicyDecision {
  const tier = policy[manifest.trust];
  const allowedSet = new Set<Permission>(tier.maxPermissions);
  const declared = manifest.permissions as Permission[];
  const disallowed = declared.filter((p) => !allowedSet.has(p));
  if (disallowed.length > 0) {
    return {
      allowed: false,
      trust: manifest.trust,
      declared,
      allowedPermissions: tier.maxPermissions,
      disallowed,
      reason: `trust tier "${manifest.trust}" does not permit: ${disallowed.join(", ")}`,
    };
  }
  return {
    allowed: true,
    trust: manifest.trust,
    declared,
    allowedPermissions: tier.maxPermissions,
    disallowed: [],
  };
}
