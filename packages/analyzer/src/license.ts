// SPDX detection by fingerprinting the license text. Not exhaustive but
// covers the licenses we actually care about. Unknown licenses are
// classified as "unknown" and treated as unsafe to copy.
export type LicenseVerdict = "permissive" | "copyleft" | "unknown";

export interface LicenseInfo {
  spdx: string;
  verdict: LicenseVerdict;
  copyable: boolean;
}

const PERMISSIVE = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC",
  "0BSD", "Unlicense", "CC0-1.0", "Zlib",
]);

const COPYLEFT = new Set([
  "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later",
  "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later",
  "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
  "LGPL-2.1", "LGPL-3.0", "MPL-2.0", "EUPL-1.2",
]);

export function classifyLicense(spdx: string): LicenseInfo {
  const clean = spdx.trim();
  if (PERMISSIVE.has(clean)) {
    return { spdx: clean, verdict: "permissive", copyable: true };
  }
  if (COPYLEFT.has(clean)) {
    return { spdx: clean, verdict: "copyleft", copyable: false };
  }
  return { spdx: clean || "UNKNOWN", verdict: "unknown", copyable: false };
}

export function detectLicenseFromText(text: string): LicenseInfo {
  const t = text.toLowerCase();
  // Apache requires the specific phrase
  if (t.includes("apache license") && t.includes("version 2.0")) {
    return classifyLicense("Apache-2.0");
  }
  // AGPL before GPL
  if (t.includes("affero general public license")) {
    if (t.includes("version 3")) return classifyLicense("AGPL-3.0");
    return classifyLicense("AGPL-3.0");
  }
  // LGPL before GPL
  if (t.includes("lesser general public license")) {
    if (t.includes("version 3")) return classifyLicense("LGPL-3.0");
    return classifyLicense("LGPL-2.1");
  }
  if (t.includes("gnu general public license")) {
    if (t.includes("version 3")) return classifyLicense("GPL-3.0");
    if (t.includes("version 2")) return classifyLicense("GPL-2.0");
    return classifyLicense("GPL-3.0");
  }
  if (t.includes("mozilla public license")) return classifyLicense("MPL-2.0");
  // MIT is identified by the permission grant phrase
  if (t.includes("permission is hereby granted, free of charge")) {
    return classifyLicense("MIT");
  }
  if (t.includes("redistribution and use in source and binary forms")) {
    if (t.includes("neither the name")) return classifyLicense("BSD-3-Clause");
    return classifyLicense("BSD-2-Clause");
  }
  if (t.includes("isc license")) return classifyLicense("ISC");
  if (t.includes("the unlicense")) return classifyLicense("Unlicense");
  if (t.includes("creative commons zero") || t.includes("cc0 1.0")) return classifyLicense("CC0-1.0");
  if (t.includes("zlib license")) return classifyLicense("Zlib");
  if (t.includes("boost software license")) return classifyLicense("BSL-1.0");
  return { spdx: "UNKNOWN", verdict: "unknown", copyable: false };
}
