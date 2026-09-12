import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CapabilityLanguage, CapabilityTrust, CapabilityRisk, Permission } from "@secstreet/contracts";

export interface NewCapabilityOptions {
  root: string;
  name: string;
  description: string;
  language: CapabilityLanguage;
  trust?: CapabilityTrust;
  risk?: CapabilityRisk;
  permissions?: Permission[];
  maintainer: string;
  author: string;
  license: string;
}

function entrypointFor(lang: CapabilityLanguage): string {
  switch (lang) {
    case "python": return "main.py";
    case "rust":
    case "go":
    case "binary": return "bin";
    case "shell": return "run.sh";
    default: return "index.js";
  }
}

function stubFor(lang: CapabilityLanguage, name: string): string {
  if (lang === "python") {
    return [
      "#!/usr/bin/env python3",
      "import json, sys",
      "",
      "def main():",
      "    try:",
      "        payload = json.loads(sys.stdin.read() or \"{}\")",
      "    except json.JSONDecodeError as e:",
      "        print(f\"invalid JSON: {e}\", file=sys.stderr)",
      "        sys.exit(1)",
      "    # TODO: implement " + name,
      "    sys.stdout.write(json.dumps({}))",
      "",
      "if __name__ == \"__main__\":",
      "    main()",
      "",
    ].join("\n");
  }
  if (lang === "shell") {
    return [
      "#!/bin/sh",
      "set -eu",
      "# TODO: implement " + name,
      "read -r INPUT || true",
      "printf '{}'",
      "",
    ].join("\n");
  }
  return [
    "#!/usr/bin/env node",
    "let raw = \"\";",
    "process.stdin.on(\"data\", (d) => (raw += d.toString()));",
    "process.stdin.on(\"end\", () => {",
    "  try {",
    "    const input = JSON.parse(raw || \"{}\");",
    "    void input;",
    "    // TODO: implement " + name,
    "    process.stdout.write(JSON.stringify({}));",
    "  } catch (err) {",
    "    process.stderr.write(String(err && err.message ? err.message : err));",
    "    process.exit(1);",
    "  }",
    "});",
    "",
  ].join("\n");
}

export async function scaffoldCapability(opts: NewCapabilityOptions): Promise<string> {
  const dir = join(opts.root, opts.name);
  if (existsSync(dir)) throw new Error("already exists: " + dir);
  await mkdir(dir, { recursive: true });

  const manifest = {
    name: opts.name,
    version: "0.1.0",
    description: opts.description,
    language: opts.language,
    entrypoint: entrypointFor(opts.language),
    inputSchema: "input.schema.json",
    outputSchema: "output.schema.json",
    dependencies: [],
    os: ["linux", "darwin"],
    permissions: opts.permissions ?? [],
    risk: opts.risk ?? "low",
    trust: opts.trust ?? "community",
    provenance: {
      sourceRepo: "",
      sourceAuthor: opts.author,
      license: opts.license,
      version: "0.1.0",
      modifications: [],
    },
    maintainer: opts.maintainer,
    execution: { timeoutMs: 15000 },
  };

  await writeFile(join(dir, "capability.json"), JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(join(dir, "input.schema.json"), JSON.stringify({ type: "object", properties: {} }, null, 2) + "\n");
  await writeFile(join(dir, "output.schema.json"), JSON.stringify({ type: "object", properties: {} }, null, 2) + "\n");
  await writeFile(join(dir, entrypointFor(opts.language)), stubFor(opts.language, opts.name));

  return dir;
}
